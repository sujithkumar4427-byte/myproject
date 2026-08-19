const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const asyncHandler = require('../middleware/asyncHandler');

// Helper: compute shipping and tax (simple rules)
const computeShipping = (itemsPrice) => {
  // Free shipping for orders over 100, otherwise flat 10
  return itemsPrice > 100 ? 0 : 10;
};

const computeTax = (itemsPrice) => {
  // 10% tax for simplicity
  return Number((itemsPrice * 0.1).toFixed(2));
};

// Create a new order
const createOrder = asyncHandler(async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  const { orderItems, shippingAddress, paymentMethod } = req.body;

  if (!orderItems || !Array.isArray(orderItems) || orderItems.length === 0) {
    return res.status(400).json({ success: false, message: 'Order must contain at least one item' });
  }

  if (!shippingAddress || !shippingAddress.firstName || !shippingAddress.lastName || !shippingAddress.street) {
    return res.status(400).json({ success: false, message: 'Valid shipping address is required' });
  }

  // Validate and build server-side order items using DB prices
  let itemsPrice = 0;
  const resolvedItems = [];

  for (const item of orderItems) {
    const { product: productId, qty } = item;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ success: false, message: `Invalid product ID: ${productId}` });
    }

    if (!Number.isInteger(qty) || qty <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid quantity for product' });
    }

    const product = await Product.findById(productId);
    if (!product || !product.isActive) {
      return res.status(400).json({ success: false, message: `Product not available: ${productId}` });
    }

    if (product.stock < qty) {
      return res.status(400).json({ success: false, message: `Insufficient stock for product: ${product.name}` });
    }

    const price = product.price; // authoritative price
    const lineTotal = Number((price * qty).toFixed(2));
    itemsPrice += lineTotal;

    resolvedItems.push({ product: product._id, name: product.name, qty, price, imageUrl: product.imageUrl });
  }

  itemsPrice = Number(itemsPrice.toFixed(2));
  const shippingPrice = computeShipping(itemsPrice);
  const taxPrice = computeTax(itemsPrice);
  const totalPrice = Number((itemsPrice + shippingPrice + taxPrice).toFixed(2));

  // Create order and decrement stock without requiring unsupported MongoDB transactions.
  try {
    const createdOrder = await Order.create({
      user: req.user._id,
      orderItems: resolvedItems,
      shippingAddress,
      paymentMethod: paymentMethod || 'card',
      itemsPrice,
      shippingPrice,
      taxPrice,
      totalPrice,
    });

    for (const it of resolvedItems) {
      const updated = await Product.findOneAndUpdate(
        { _id: it.product, stock: { $gte: it.qty } },
        { $inc: { stock: -it.qty } },
        { new: true }
      );

      if (!updated) {
        await Order.findByIdAndDelete(createdOrder._id);
        return res.status(400).json({ success: false, message: `Insufficient stock for product: ${it.name}` });
      }
    }

    const populatedOrder = await Order.findById(createdOrder._id)
      .populate('user', 'firstName lastName email')
      .populate('orderItems.product', 'name imageUrl');

    return res.status(201).json({ success: true, data: populatedOrder });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Order creation failed' });
  }
});

// Get orders for current user
const getMyOrders = asyncHandler(async (req, res) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'Authentication required' });

  const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 });
  res.status(200).json({ success: true, count: orders.length, data: orders });
});

// Get order by id (user can access own order, admin can access any)
const getOrderById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: 'Invalid order ID' });
  }

  const order = await Order.findById(id).populate('user', 'firstName lastName email');
  if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

  if (order.user._id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }

  res.status(200).json({ success: true, data: order });
});

// Admin: get all orders
const getAllOrders = asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Access denied' });

  const orders = await Order.find({}).sort({ createdAt: -1 }).populate('user', 'firstName lastName email');
  res.status(200).json({ success: true, count: orders.length, data: orders });
});

// Admin: update order status
const updateOrderStatus = asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Access denied' });

  const { id } = req.params;
  const { status } = req.body;
  const allowed = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];

  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ success: false, message: 'Invalid order ID' });
  if (!status || !allowed.includes(status)) return res.status(400).json({ success: false, message: 'Invalid status value' });

  const order = await Order.findById(id);
  if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

  order.status = status;
  if (status === 'delivered') {
    order.deliveredAt = new Date();
  }

  await order.save();
  res.status(200).json({ success: true, message: 'Order status updated', data: order });
});

// User: cancel own eligible order
const cancelOrder = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ success: false, message: 'Invalid order ID' });

  const order = await Order.findById(id);
  if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

  // Only owner or admin can cancel
  if (order.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }

  // Only allow cancel if status is pending or processing
  if (!['pending', 'processing'].includes(order.status) && req.user.role !== 'admin') {
    return res.status(400).json({ success: false, message: 'Order cannot be cancelled at this stage' });
  }

  order.status = 'cancelled';
  await order.save();

  // Restore product stock
  for (const it of order.orderItems) {
    await Product.findByIdAndUpdate(it.product, { $inc: { stock: it.qty } });
  }

  res.status(200).json({ success: true, message: 'Order cancelled', data: order });
});

module.exports = {
  createOrder,
  getMyOrders,
  getOrderById,
  getAllOrders,
  updateOrderStatus,
  cancelOrder,
};
