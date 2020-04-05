const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { randomBytes } = require("crypto");
const { promisify } = require("util");

const Mutations = {
  // TODO: Check if user is logged in

  async createItem(parent, args, ctx, info) {
    const item = await ctx.db.mutation.createItem(
      {
        data: { ...args },
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
    const where = { id: args.id };

    // Find the item
    const item = await ctx.db.query.item({ where }, `{ id title}`);

    // Check if the own the item, permission
    // TODO

    // Delete item
    return ctx.db.mutation.deleteItem({ where }, info);
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
          permissions: { set: ["USER"] },
        },
      },
      info
    );

    // Create token
    const token = jwt.sign({ userId: user.id }, process.env.APP_SECRET);

    // Set jwt as a token on the response
    ctx.response.cookie("token", token, {
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
    ctx.response.cookie("token", token, {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24,
    });

    // Return user
    return user;
  },

  signout(parent, args, ctx, info) {
    ctx.response.clearCookie("token");
    return { message: "Signed out." };
  },

  async requestReset(parent, args, ctx, info) {
    // Check user
    const user = await ctx.db.query.user({ where: { email: args.email } });

    if (!user) {
      throw new Error(`No such user found for email: ${args.email}`);
    }

    // Set reset token and expiry
    const randomBytesPromisified = promisify(randomBytes);
    const resetToken = (await randomBytesPromisified(20)).toString("hex");
    const resetTokenExpiry = Date.now() + 3600000;
    const res = await ctx.db.mutation.updateUser({
      where: { email: args.email },
      data: { resetToken, resetTokenExpiry },
    });

    console.log(res);

    return { message: "Reset Token Sent" };
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
    ctx.response.cookie("token", token, {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24,
    });

    return updatedUser;
  },
};

module.exports = Mutations;
