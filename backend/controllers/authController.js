const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { User, AuditLog } = require('../models');
const { checkLockout } = require('../middleware');
const { sendPasswordResetEmail, sendWelcomeEmail } = require('../config/email');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()]
});

// Token generation
const generateAccessToken = (user) => {
  return jwt.sign(
    {
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
      roleLevel: user.roleLevel,
      isAdmin: user.isAdmin,
      superior: user.superior?.toString(),
      firstName: user.firstName,   // ← ADD THIS
      lastName: user.lastName  
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.ACCESS_TOKEN_EXPIRY || '15m' }
  );
};

const generateRefreshToken = (user) => {
  return jwt.sign(
    {
      userId: user._id.toString(),
      email: user.email,
      tokenVersion: user.refreshTokenVersion
    },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.REFRESH_TOKEN_EXPIRY || '7d' }
  );
};

// Register (Admin only)
exports.register = async (req, res) => {
  try {
    const {
      email,
      password,
      firstName,
      lastName,
      role,
      department,
      superior
    } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Get role level from hierarchy
    const hierarchy = require('../config/hierarchy.config');
    const roleConfig = hierarchy.getRoleByName(role);
    const roleLevel = roleConfig?.level || 3;

    // Create user
    const user = new User({
      email,
      password,
      firstName,
      lastName,
      role,
      roleLevel,
      department: department || 'Engineering',
      superior: superior || null,
      isFirstLogin: true
    });

    await user.save();

    // Log audit
    await AuditLog.create({
      user: req.user?.userId,
      action: 'user_create',
      resourceType: 'user',
      resourceId: user._id,
      newValue: { email, firstName, lastName, role },
      success: true,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    // Send welcome email (async, don't wait)
    sendWelcomeEmail(email, firstName).catch(err =>
      logger.error(`Failed to send welcome email: ${err.message}`)
    );

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role
      }
    });
  } catch (error) {
    logger.error(`Registration error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to create user'
    });
  }
};

// Login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check lockout
    const lockout = await checkLockout(email);
    if (lockout.locked) {
      await AuditLog.create({
        email,
        action: 'login',
        resourceType: 'auth',
        success: false,
        errorMessage: `Account locked. ${lockout.timeRemaining} minutes remaining.`,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      return res.status(423).json({
        success: false,
        message: `Account locked. Try again in ${lockout.timeRemaining} minutes.`,
        locked: true,
        timeRemaining: lockout.timeRemaining
      });
    }

    // Find user
    const user = await User.findOne({ email });

    if (!user) {
      await AuditLog.create({
        email,
        action: 'login',
        resourceType: 'auth',
        success: false,
        errorMessage: 'Invalid credentials',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if account is active
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated'
      });
    }

    // Verify password
    const isValidPassword = await user.comparePassword(password);

    if (!isValidPassword) {
      // Increment failed attempts
      await user.incrementLoginAttempts();

      const remainingAttempts = 5 - user.failedLoginAttempts;

      await AuditLog.create({
        user: user._id,
        email,
        action: 'login',
        resourceType: 'auth',
        success: false,
        errorMessage: 'Invalid password',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
        remainingAttempts
      });
    }

    // Reset failed attempts
    await user.resetLoginAttempts();

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Log successful login
    await AuditLog.create({
      user: user._id,
      email,
      action: 'login',
      resourceType: 'auth',
      success: true,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    // Set refresh token in httpOnly cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.json({
      success: true,
      accessToken,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: user.fullName,
        role: user.role,
        roleLevel: user.roleLevel,
        isAdmin: user.isAdmin,
        avatar: user.avatar,
        isFirstLogin: user.isFirstLogin,
        darkMode: user.darkMode,
        timezone: user.timezone
      }
    });
  } catch (error) {
    logger.error(`Login error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Login failed'
    });
  }
};

// Refresh token
exports.refresh = async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token required'
      });
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    // Find user and check token version
    const user = await User.findById(decoded.userId);

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Invalid refresh token'
      });
    }

    if (user.refreshTokenVersion !== decoded.tokenVersion) {
      return res.status(401).json({
        success: false,
        message: 'Token has been revoked'
      });
    }

    // Generate new tokens
    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user);

    // Set new refresh token
    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({
      success: true,
      accessToken: newAccessToken,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: user.fullName,
        role: user.role,
        roleLevel: user.roleLevel,
        isAdmin: user.isAdmin,
        avatar: user.avatar,
        isFirstLogin: user.isFirstLogin,
        darkMode: user.darkMode
      }
    });
  } catch (error) {
    logger.error(`Token refresh error: ${error.message}`);

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Refresh token expired',
        code: 'REFRESH_EXPIRED'
      });
    }

    res.status(401).json({
      success: false,
      message: 'Invalid refresh token'
    });
  }
};

// Logout
exports.logout = async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;

    if (refreshToken) {
      // Optional: Add to blacklist in Redis
      // await redis.set(`blacklist:${refreshToken}`, 'true', 'EX', 7 * 24 * 60 * 60);
    }

    // Clear cookie
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none'
    });

    // Log logout
    if (req.user?.userId) {
      await AuditLog.create({
        user: req.user.userId,
        action: 'logout',
        resourceType: 'auth',
        success: true,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });
    }

    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    logger.error(`Logout error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Logout failed'
    });
  }
};

// Forgot password
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      // Don't reveal if user exists
      return res.json({
        success: true,
        message: 'If an account exists, a reset email has been sent'
      });
    }

    // Generate reset token
    const resetToken = uuidv4();
    user.passwordResetToken = resetToken;
    user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save();

    // Send reset email
    await sendPasswordResetEmail(email, resetToken);

    await AuditLog.create({
      user: user._id,
      action: 'password_reset',
      resourceType: 'auth',
      success: true,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      message: 'If an account exists, a reset email has been sent'
    });
  } catch (error) {
    logger.error(`Forgot password error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to process request'
    });
  }
};

// Reset password
exports.resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    const user = await User.findOne({
      passwordResetToken: token,
      passwordResetExpires: { $gt: new Date() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token'
      });
    }

    // Update password
    user.password = password;
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    user.refreshTokenVersion += 1; // Invalidate existing sessions
    await user.save();

    await AuditLog.create({
      user: user._id,
      action: 'password_change',
      resourceType: 'auth',
      success: true,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      message: 'Password reset successfully'
    });
  } catch (error) {
    logger.error(`Reset password error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to reset password'
    });
  }
};

// Change password (authenticated)
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.userId;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Verify current password
    const isValid = await user.comparePassword(currentPassword);

    if (!isValid) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Update password
    user.password = newPassword;
    user.refreshTokenVersion += 1;
    await user.save();

    await AuditLog.create({
      user: user._id,
      action: 'password_change',
      resourceType: 'auth',
      success: true,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    logger.error(`Change password error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to change password'
    });
  }
};

// Complete onboarding
exports.completeOnboarding = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { timezone, darkMode, phone } = req.body;

    const user = await User.findByIdAndUpdate(
      userId,
      {
        isFirstLogin: false,
        ...(timezone && { timezone }),
        ...(darkMode !== undefined && { darkMode }),
        ...(phone && { phone })
      },
      { new: true }
    );

    res.json({
      success: true,
      message: 'Onboarding completed',
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        isFirstLogin: user.isFirstLogin
      }
    });
  } catch (error) {
    logger.error(`Onboarding error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to complete onboarding'
    });
  }
};

// Get current user
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId)
      .populate('superior', 'firstName lastName email role')
      .select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: user.fullName,
        role: user.role,
        roleLevel: user.roleLevel,
        isAdmin: user.isAdmin,
        avatar: user.avatar,
        phone: user.phone,
        timezone: user.timezone,
        darkMode: user.darkMode,
        isFirstLogin: user.isFirstLogin,
        superior: user.superior,
        joinedAt: user.joinedAt
      }
    });
  } catch (error) {
    logger.error(`Get me error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to get user'
    });
  }
};
