const express = require('express');
const { body, param } = require('express-validator');
const validate = require('../middleware/validate.middleware');
const { protect, admin } = require('../middleware/auth.middleware');
const {
  createOrder,
  getMyOrders,
  getOrderById,
  getAllOrders,
  updateOrderStatus,
  cancelOrder,
} = require('../controllers/order.controller');

const router = express.Router();

// Create order
const createValidation = [
  body('orderItems').isArray({ min: 1 }).withMessage('orderItems must be a non-empty array'),
  body('orderItems.*.product').notEmpty().withMessage('product id is required'),
  body('orderItems.*.qty').isInt({ gt: 0 }).withMessage('qty must be a positive integer'),
  body('shippingAddress.firstName').notEmpty().withMessage('Shipping first name is required'),
  body('shippingAddress.lastName').notEmpty().withMessage('Shipping last name is required'),
  body('shippingAddress.email').isEmail().withMessage('Valid shipping email is required'),
  body('shippingAddress.street').notEmpty().withMessage('Shipping street is required'),
  body('shippingAddress.city').notEmpty().withMessage('Shipping city is required'),
  body('shippingAddress.postalCode').notEmpty().withMessage('Shipping postalCode is required'),
  body('shippingAddress.country').notEmpty().withMessage('Shipping country is required'),
  validate,
];

router.post('/', protect, createValidation, createOrder);
router.get('/my-orders', protect, getMyOrders);
router.get('/:id', protect, getOrderById);
router.get('/', protect, admin, getAllOrders);

// Update status (admin only)
const statusValidation = [param('id').notEmpty().withMessage('Order ID required'), body('status').notEmpty().withMessage('Status is required'), validate];
router.put('/:id/status', protect, admin, statusValidation, updateOrderStatus);

// Cancel order (owner or admin)
router.put('/:id/cancel', protect, cancelOrder);

module.exports = router;
