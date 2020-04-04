const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const Mutations = {
  // TODO: Check if user is logged in

  async createItem(parent, args, ctx, info) {
    const item = await ctx.db.mutation.createItem(
      {
        data: { ...args }
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
          id: args.id
        }
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
          permissions: { set: ["USER"] }
        }
      },
      info
    );

    // Create token
    const token = jwt.sign({ userId: user.id }, process.env.APP_SECRET);

    // Set jwt as a token on the response
    ctx.response.cookie("token", token, {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24
    });

    // Return User
    return user;
  }
};

module.exports = Mutations;
