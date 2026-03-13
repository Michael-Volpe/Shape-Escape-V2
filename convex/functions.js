import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * 1. AUTHENTICATION & ACCOUNT CREATION
 */

export const createAccount = mutation({
  args: { username: v.string(), password: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("username"), args.username))
      .first();

    if (existing) {
      throw new Error("That name is already taken! Choose a different legend.");
    }

    // Create main user record
    await ctx.db.insert("users", { 
      username: args.username, 
      password: args.password,
      created: Date.now() 
    });

    // Initialize the bank (The Coins Table)
    await ctx.db.insert("coins", {
      username: args.username,
      totalCoins: 0
    });

    // Initialize Skin Inventory (Every player starts with basic stripes)
    await ctx.db.insert("skins", {
      username: args.username,
      ownedSkins: ["s1"] 
    });

    // Initialize Customization
    await ctx.db.insert("customization", {
      username: args.username,
      color: "#ff4444",
      shape: "50%",
      skinClass: "skin-stripes" // FIXED: Start with stripes visible instead of empty
    });

    return { success: true };
  },
});

export const checkLogin = query({
  args: { username: v.string(), password: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .filter((q) => 
        q.and(
          q.eq(q.field("username"), args.username),
          q.eq(q.field("password"), args.password)
        )
      )
      .first();
    
    if (!user) return null;

    const coinRecord = await ctx.db
      .query("coins")
      .filter((q) => q.eq(q.field("username"), args.username))
      .unique();

    return { 
      username: user.username, 
      coins: coinRecord ? coinRecord.totalCoins : 0 
    };
  },
});

/**
 * 2. CUSTOMIZATION & SKINS SYSTEM
 */

export const getCustomization = query({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("customization")
      .filter((q) => q.eq(q.field("username"), args.username))
      .unique();
  },
});

export const updateCustomization = mutation({
  args: { 
    username: v.string(), 
    color: v.string(), 
    shape: v.string(),
    skinClass: v.string() 
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("customization")
      .filter((q) => q.eq(q.field("username"), args.username))
      .unique();

    // FIXED: If skinClass is empty/null from the frontend, keep the old one!
    const finalSkin = (args.skinClass === "" && existing) ? existing.skinClass : args.skinClass;

    if (existing) {
      await ctx.db.patch(existing._id, { 
        color: args.color, 
        shape: args.shape,
        skinClass: finalSkin 
      });
    } else {
      await ctx.db.insert("customization", { 
        username: args.username, 
        color: args.color, 
        shape: args.shape,
        skinClass: args.skinClass 
      });
    }
  },
});

export const getOwnedSkins = query({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    const record = await ctx.db
      .query("skins")
      .filter((q) => q.eq(q.field("username"), args.username))
      .unique();
    return record ? record.ownedSkins : ["s1"];
  },
});

export const unlockSkin = mutation({
  args: { username: v.string(), skinId: v.string(), price: v.number() },
  handler: async (ctx, args) => {
    // 1. Get the player's coin record
    const coinRecord = await ctx.db
      .query("coins")
      .filter((q) => q.eq(q.field("username"), args.username))
      .unique();

    if (!coinRecord || coinRecord.totalCoins < args.price) {
      throw new Error("Insufficient funds!");
    }

    // 2. Subtract coins first
    await ctx.db.patch(coinRecord._id, {
      totalCoins: coinRecord.totalCoins - args.price
    });

    // 3. Find or Create the Skin Entry
    const skinRecord = await ctx.db
      .query("skins")
      .filter((q) => q.eq(q.field("username"), args.username))
      .unique();

    if (skinRecord) {
        const currentSkins = skinRecord.ownedSkins || [];
        if (!currentSkins.includes(args.skinId)) {
            await ctx.db.patch(skinRecord._id, {
                ownedSkins: [...currentSkins, args.skinId]
            });
        }
    } else {
      await ctx.db.insert("skins", {
        username: args.username,
        ownedSkins: ["s1", args.skinId]
      });
    }

    return { success: true };
  },
});

/**
 * 3. COINS & SCORING
 */

export const getUserCoins = query({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    const coinRecord = await ctx.db
      .query("coins")
      .filter((q) => q.eq(q.field("username"), args.username))
      .unique();
    return coinRecord ? coinRecord.totalCoins : 0;
  },
});

export const addScore = mutation({
  args: { 
    name: v.string(), 
    score: v.number(), 
    level: v.number(), 
    time: v.number(),
    coinsEarned: v.number() 
  },
  handler: async (ctx, args) => {
    // Save to general scores table for global leaderboard
    await ctx.db.insert("scores", {
      name: args.name,
      score: args.score,
      level: args.level,
      time: args.time,
      coinsGained: args.coinsEarned, 
      date: Date.now(),
    });

    // Save specifically to md_scores for Meteor Dash statistics
    await ctx.db.insert("md_scores", {
      username: args.name,
      meteorsAvoided: args.score,
      finalLevel: args.level,
      timeSurvived: args.time,
      coinsGained: args.coinsEarned,
      timestamp: Date.now()
    });

    const coinRecord = await ctx.db
      .query("coins")
      .filter((q) => q.eq(q.field("username"), args.name))
      .unique();

    if (coinRecord) {
      await ctx.db.patch(coinRecord._id, {
        totalCoins: coinRecord.totalCoins + args.coinsEarned
      });
    } else {
      await ctx.db.insert("coins", {
        username: args.name,
        totalCoins: args.coinsEarned
      });
    }
  },
});

/**
 * 4. LEADERBOARD & STATS
 */

export const getTopScores = query({
  handler: async (ctx) => {
    const allUsers = await ctx.db.query("users").collect();
    const allScores = await ctx.db.query("scores").collect();
    const allCoins = await ctx.db.query("coins").collect();

    const leaderboard = allUsers.map((user) => {
      const userScores = allScores.filter((s) => s.name?.trim() === user.username?.trim());
      const userCoins = allCoins.find((c) => c.username?.trim() === user.username?.trim());
      
      if (userScores.length > 0) {
        const topScore = userScores.sort((a, b) => b.score - a.score)[0];
        return { ...topScore, coins: userCoins ? userCoins.totalCoins : 0 };
      } else {
        return {
          name: user.username,
          score: 0,
          level: 0,
          time: 0,
          coins: userCoins ? userCoins.totalCoins : 0,
          date: user.created || Date.now(),
        };
      }
    });

    return leaderboard.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.date - a.date;
    });
  },
});

// Specific leaderboard for Meteor Dash pulling from md_scores
export const getMeteorLeaderboard = query({
  handler: async (ctx) => {
    // 1. Fetch a large batch of recent scores
    const records = await ctx.db
      .query("md_scores")
      .order("desc") 
      .take(500);
    
    const uniqueHighs = new Map();

    // 2. Group by user and only keep their BEST run
    records.forEach(run => {
      const name = run.username || "Anonymous";
      if (!uniqueHighs.has(name) || run.meteorsAvoided > uniqueHighs.get(name).meteorsAvoided) {
        uniqueHighs.set(name, run);
      }
    });

    // 3. Convert back to array, sort by score, and take top 100
    return Array.from(uniqueHighs.values())
      .sort((a, b) => {
        if (b.meteorsAvoided !== a.meteorsAvoided) {
            return b.meteorsAvoided - a.meteorsAvoided;
        }
        return b.timestamp - a.timestamp;
      })
      .slice(0, 100);
  },
});

export const getOnlineCount = query({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    return users.length;
  },
});
