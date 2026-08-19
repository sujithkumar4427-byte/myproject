const User = require('../models/User');
const generateToken = require('../utils/generateToken');
const asyncHandler = require('../middleware/asyncHandler');

/**
 * @desc    Register a new user
 * @route   POST /api/auth/register
 * @access  Public
 */
const registerUser = asyncHandler(async (req, res) => {
  const { firstName, lastName, email, password, role, addresses } = req.body;

  // Check if user already exists
  const userExists = await User.findOne({ email: email.toLowerCase() });
  if (userExists) {
    return res.status(400).json({
      success: false,
      message: 'A user with this email address already exists',
    });
  }

  // Prevent unauthorized creation of admin accounts via public registration
  const userRole = role === 'admin' ? 'user' : (role || 'user');

  // Create new user (password is hashed in pre('save') hook)
  const user = await User.create({
    firstName,
    lastName,
    email,
    password,
    role: userRole,
    addresses: addresses || [],
  });

  if (user) {
    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        addresses: user.addresses,
        token,
      },
    });
  } else {
    res.status(400).json({
      success: false,
      message: 'Invalid user registration data provided',
    });
  }
});

/**
 * @desc    Authenticate user & get token
 * @route   POST /api/auth/login
 * @access  Public
 */
const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Find user by email and explicitly select password field
  const user = await User.findOne({ email: email.toLowerCase() }).select('+password');

  if (user && (await user.matchPassword(password))) {
    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        addresses: user.addresses,
        token,
      },
    });
  } else {
    res.status(401).json({
      success: false,
      message: 'Invalid email or password',
    });
  }
});

/**
 * @desc    Get current user profile
 * @route   GET /api/auth/me
 * @access  Private
 */
const getUserProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  if (user) {
    res.status(200).json({
      success: true,
      data: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        addresses: user.addresses,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  } else {
    res.status(404).json({
      success: false,
      message: 'User profile not found',
    });
  }
});

/**
 * @desc    Update current user profile
 * @route   PUT /api/auth/profile
 * @access  Private
 */
const updateUserProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found',
    });
  }

  // If email change requested, verify it's not already in use
  if (req.body.email && req.body.email.toLowerCase() !== user.email) {
    const emailExists = await User.findOne({
      email: req.body.email.toLowerCase(),
      _id: { $ne: user._id },
    });

    if (emailExists) {
      return res.status(400).json({
        success: false,
        message: 'This email is already in use by another account',
      });
    }
    user.email = req.body.email.toLowerCase();
  }

  user.firstName = req.body.firstName || user.firstName;
  user.lastName = req.body.lastName || user.lastName;

  if (req.body.addresses) {
    user.addresses = req.body.addresses;
  }

  if (req.body.password) {
    if (req.body.password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long',
      });
    }
    user.password = req.body.password;
  }

  const updatedUser = await user.save();
  const token = generateToken(updatedUser._id);

  res.status(200).json({
    success: true,
    message: 'Profile updated successfully',
    data: {
      _id: updatedUser._id,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      email: updatedUser.email,
      role: updatedUser.role,
      addresses: updatedUser.addresses,
      token,
    },
  });
});

module.exports = {
  registerUser,
  loginUser,
  getUserProfile,
  updateUserProfile,
};
