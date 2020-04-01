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
  }
};

module.exports = Mutations;
