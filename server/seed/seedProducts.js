require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const Product = require('../models/Product');

const products = [
  {
    name: 'Obsidian Vessel',
    category: 'Ceramics',
    description: 'Hand-thrown stoneware with a volcanic black glaze.',
    price: 148,
    originalPrice: 185,
    badge: 'Bestseller',
    rating: 5,
    imageUrl: 'https://images.unsplash.com/photo-1610701596007-11502861dcfa?w=600&q=80',
    stock: 25,
  },
  {
    name: 'Linen Cloud Throw',
    category: 'Textiles',
    description: 'Woven from 100% organic Belgian linen, naturally softened.',
    price: 229,
    originalPrice: null,
    badge: null,
    rating: 5,
    imageUrl: 'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?w=600&q=80',
    stock: 18,
  },
  {
    name: 'Alabaster Candleholder',
    category: 'Decor',
    description: 'Hewn from solid alabaster stone, each piece is unique.',
    price: 94,
    originalPrice: 120,
    badge: 'Sale',
    rating: 4,
    imageUrl: 'https://images.unsplash.com/photo-1602028915047-37269d1a73f7?w=600&q=80',
    stock: 30,
  },
  {
    name: 'Copper Pour-Over Set',
    category: 'Kitchen',
    description: 'Brushed copper and borosilicate glass, precision-crafted.',
    price: 175,
    originalPrice: null,
    badge: 'New',
    rating: 5,
    imageUrl: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=600&q=80',
    stock: 15,
  },
  {
    name: 'Merino Journey Blanket',
    category: 'Textiles',
    description: '100% Mongolian merino, double-weave construction.',
    price: 312,
    originalPrice: 380,
    badge: null,
    rating: 5,
    imageUrl: 'https://images.unsplash.com/photo-1580301762395-21ce84d00bc6?w=600&q=80',
    stock: 12,
  },
  {
    name: 'Walnut Serving Board',
    category: 'Kitchen',
    description: 'Live-edge black walnut with food-safe oil finish.',
    price: 118,
    originalPrice: null,
    badge: null,
    rating: 4,
    imageUrl: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=600&q=80',
    stock: 20,
  },
  {
    name: 'Matte Brass Tray',
    category: 'Decor',
    description: 'Cast solid brass, hand-patinated in warm antiqued tones.',
    price: 86,
    originalPrice: 110,
    badge: 'Sale',
    rating: 4,
    imageUrl: 'https://images.unsplash.com/photo-1585515320310-259814833e62?w=600&q=80',
    stock: 22,
  },
  {
    name: 'Seagrass Basket Set',
    category: 'Organizers',
    description: 'Hand-woven in Vietnam, set of three nested sizes.',
    price: 135,
    originalPrice: null,
    badge: 'New',
    rating: 5,
    imageUrl: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=600&q=80',
    stock: 16,
  },
];

const seedProducts = async () => {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error('MONGODB_URI is not defined. Copy .env.example to .env and set your connection string.');
    process.exit(1);
  }

  try {
    await mongoose.connect(uri);
    console.log('Connected to MongoDB');

    await Product.deleteMany({});
    console.log('Cleared existing products');

    const created = await Product.insertMany(products);
    console.log(`Seeded ${created.length} products`);

    await mongoose.connection.close();
    console.log('Database connection closed');
    process.exit(0);
  } catch (error) {
    console.error(`Seed error: ${error.message}`);
    process.exit(1);
  }
};

seedProducts();
