const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomBytes } = require('crypto');
const { promisify } = require('util');
const { transport, makeAnEmail } = require('../mail');
const { hasPermission } = require('../utils');

const Mutations = {
  async createItem(parent, args, ctx, info) {
    if (!ctx.request.userId) {
      throw new Error(`You must be logged in to that!`);
    }

    const item = await ctx.db.mutation.createItem(
      {
        data: {
          // Connect Item to User
          user: {
            connect: {
              id: ctx.request.userId,
            },
          },
          ...args,
        },
      },
      info
    );

    return item;
  },

  updateItem(parent, args, ctx, info) {
    // Take a copy of updates
    const updates = { ...args };

    // Remove ID from updates, we are not updating IDs
    delete updates.id;

    // Run update
    return ctx.db.mutation.updateItem(
      {
        data: updates,
        where: {
          id: args.id,
        },
      },
      info
    );
  },

  async deleteItem(parent, args, ctx, info) {
    if (!ctx.request.userId) {
      throw new Error(`You are not logged in.`);
    }

    const where = { id: args.id };

    // Find the item
    const item = await ctx.db.query.item({ where }, `{ id title user { id }}`);

    // Check if they own the item, permission
    const ownsItem = item.user.id === ctx.request.userId;
    const hasPermissions = ctx.request.user.permissions.some((permission) =>
      ['ADMIN', 'ITEMDELETE'].includes(permission)
    );

    if (ownsItem && hasPermissions) {
      return ctx.db.mutation.deleteItem({ where }, info);
    }

    throw new Error(`You do not have permission to do that.`);
  },

  async signup(parent, args, ctx, info) {
    // Lowercase email
    args.email = args.email.toLowerCase();

    // Hash password
    const password = await bcrypt.hash(args.password, 10);

    // Create User
    const user = await ctx.db.mutation.createUser(
      {
        data: {
          ...args,
          password,
          permissions: { set: ['USER'] },
        },
      },
      info
    );

    // Create token
    const token = jwt.sign({ userId: user.id }, process.env.APP_SECRET);

    // Set jwt as a token on the response
    ctx.response.cookie('token', token, {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24,
    });

    // Return User
    return user;
  },

  async signin(parent, { email, password }, ctx, info) {
    // Check user
    const user = await ctx.db.query.user({ where: { email } });

    if (!user) {
      throw new Error(`No such user found for email: ${email}`);
    }

    // Check password
    const valid = await bcrypt.compare(password, user.password);

    if (!valid) {
      throw new Error(`Invalid Password`);
    }

    // Generate jwt token
    const token = jwt.sign({ userId: user.id }, process.env.APP_SECRET);

    // Set cookie with token
    ctx.response.cookie('token', token, {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24,
    });

    // Return user
    return user;
  },

  signout(parent, args, ctx, info) {
    ctx.response.clearCookie('token');
    return { message: 'Signed out.' };
  },

  async requestReset(parent, args, ctx, info) {
    // Check user
    const user = await ctx.db.query.user({ where: { email: args.email } });

    if (!user) {
      throw new Error(`No such user found for email: ${args.email}`);
    }

    // Set reset token and expiry
    const randomBytesPromisified = promisify(randomBytes);
    const resetToken = (await randomBytesPromisified(20)).toString('hex');
    const resetTokenExpiry = Date.now() + 3600000;

    await ctx.db.mutation.updateUser({
      where: { email: args.email },
      data: { resetToken, resetTokenExpiry },
    });

    await transport.sendMail({
      from: 'togz@ngiaw.com',
      to: user.email,
      subject: 'You Password Reset Token',
      html: makeAnEmail(`You Password Reset Token is here!
      <br />
      <br />
      <a href="${
        process.env.FRONTEND_URL
      }/reset?resetToken=${resetToken}">Click here to reset</a>`),
    });

    return { message: 'Reset Token Sent' };
  },

  async resetPassword(parent, args, ctx, info) {
    // Check if passwords matched
    if (args.password !== args.confirmPassword) {
      throw new Error(`Passwords do not match.`);
    }

    // Check token
    const [user] = await ctx.db.query.users({
      where: {
        resetToken: args.resetToken,
        resetTokenExpiry_gte: Date.now() - 3600000,
      },
    });

    if (!user) {
      throw new Error(`This token is either invalid or expired.`);
    }

    const password = await bcrypt.hash(args.password, 10);
    const updatedUser = await ctx.db.mutation.updateUser({
      where: { email: user.email },
      data: {
        password,
        resetToken: null,
        resetTokenExpiry: null,
      },
    });

    const token = jwt.sign({ userId: updatedUser.id }, process.env.APP_SECRET);
    ctx.response.cookie('token', token, {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24,
    });

    return updatedUser;
  },

  async updatePermissions(parent, args, ctx, info) {
    if (!ctx.request.userId) {
      throw new Error(`You must be logged in!`);
    }

    const currentUser = await ctx.db.query.user(
      {
        where: {
          id: ctx.request.userId,
        },
      },
      info
    );

    hasPermission(currentUser, ['ADMIN', 'PERMISSIONUPDATE']);

    return ctx.db.mutation.updateUser(
      {
        data: {
          permissions: {
            set: args.permissions,
          },
        },
        where: {
          id: args.userId,
        },
      },
      info
    );
  },

  async addToCart(parent, args, ctx, info) {
    const { userId } = ctx.request;

    const [existingCartItem] = await ctx.db.query.cartItems({
      where: {
        user: { id: userId },
        item: { id: args.id },
      },
    });

    if (existingCartItem) {
      return ctx.db.mutation.updateCartItem(
        {
          data: { quantity: existingCartItem.quantity + 1 },
          where: { id: existingCartItem.id },
        },
        info
      );
    }

    return ctx.db.mutation.createCartItem(
      {
        data: {
          item: {
            connect: { id: args.id },
          },
          user: {
            connect: { id: userId },
          },
        },
      },
      info
    );
  },

  async removeFromCart(parents, args, ctx, info) {
    const cartItem = await ctx.db.query.cartItem(
      {
        where: {
          id: args.id,
        },
      },
      `{id, user { id }}`
    );

    if (!cartItem) {
      throw new Error('No CartItem Found');
    }

    if (cartItem.user.id !== ctx.request.userId) {
      throw new Error('You do not have permission to delete this item.');
    }

    return ctx.db.mutation.deleteCartItem(
      {
        where: {
          id: args.id,
        },
      },
      info
    );
  },
};

module.exports = Mutations;
