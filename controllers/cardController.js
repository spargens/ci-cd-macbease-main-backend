const { StatusCodes } = require('http-status-codes');
const User = require('../models/user');
const Card = require('../models/card');
const Resource = require('../models/resource');
const Club = require('../models/club');
const Community = require('../models/community');
const Badge = require('../models/badge');
const schedule = require('node-schedule');
const { OpenAI } = require('openai');
const {
  lemmatize,
  getRelatedTags,
} = require('../controllers/commonControllers');
const user = require('../models/user');

//Controller 1
const createCard = async (req, res) => {
  if (req.user.role === 'user') {
    const { value, tags } = req.body;
    let lemmatizedTags = lemmatize(tags);
    const userInfo = await User.findById(req.user.id, {
      name: 1,
      image: 1,
      pushToken: 1,
      course: 1,
      _id: 0,
    });
    const card = await Card.create({
      value,
      tags: lemmatizedTags,
      creator: req.user.id,
      time: new Date(),
      userMetaData: userInfo,
    });

    //scheduling job for updating card feed
    let threeSec = new Date(Date.now() + 1 * 3 * 1000);
    schedule.scheduleJob(`feedCard_${req.user.id}`, threeSec, async () => {
      try {
        const relatedUsers = await getRelatedUsersForFeed(lemmatizedTags);
        let users = await User.find(
          { _id: { $in: relatedUsers } },
          { cardFeed: 1 }
        );
        let bulkOperations = users.map((user) => {
          let previousCards = user.cardFeed;
          if (previousCards.length > 6) {
            previousCards = previousCards.slice(-6);
          }
          return {
            updateOne: {
              filter: { _id: user._id },
              update: {
                $set: {
                  cardFeed: [
                    {
                      ...card._doc,
                      creatorName: card.userMetaData.name,
                      creatorPic: card.userMetaData.image,
                      userPushToken: card.userMetaData.pushToken,
                    },
                    ...previousCards,
                  ],
                },
              },
            },
          };
        });
        if (bulkOperations.length > 0) {
          await User.bulkWrite(bulkOperations);
        }
      } catch (error) {
        console.log(error);
      }
    });

    User.findById(req.user.id, (err, user) => {
      if (err) return console.error(err);
      user.cards.push(card._id);
      user.save((err, update) => {
        if (err) return console.error(err);
        return res
          .status(StatusCodes.OK)
          .send('The card has been successfully created.');
      });
    });
  } else {
    return res
      .status(StatusCodes.OK)
      .send('You are not authorized to create cards.');
  }
};

//Controller 2
const deleteCard = async (req, res) => {
  if (req.user.role === 'admin' || req.user.role === 'user') {
    const { cardId } = req.body;
    await Card.findByIdAndDelete({ _id: cardId });
    User.findById(req.user.id, (err, user) => {
      if (err) return console.error(err);
      let cards = user.cards;
      cards = cards.filter((item) => item.toString() !== cardId);
      user.cards = [];
      user.cards = cards;
      user.save((err, update) => {
        if (err) return console.error(err);
        return res
          .status(StatusCodes.OK)
          .send('The card hs been successfully deleted.');
      });
    });
  } else {
    return res
      .status(StatusCodes.OK)
      .send('You are not authorized to delete the cards.');
  }
};

//Controller 3
const likeACard = async (req, res) => {
  if (req.user.role === 'user') {
    const { cardId, creatorId } = req.body;
    User.findById(req.user.id, (err, user) => {
      if (err) return console.error(err);
      user.likedCards.push(cardId);
      user.notifications.push({
        key: 'likedACard',
        value: 'You have liked a card.',
        data: { cardId, creatorId },
      });
      user.save();
    });
    User.findById(creatorId, (err, user) => {
      if (err) return console.error(err);
      user.notifications.push({
        key: 'likedACard',
        value: 'Someone has liked your card.',
        data: { cardId, userId: req.user.id },
      });
      user.save();
    });
    Card.findById(cardId, (err, card) => {
      if (err) return console.error(err);
      if (card) {
        card.likedBy.push(req.user.id);
      }
      card.save((err, update) => {
        if (err) return console.error(err);
        return res.status(StatusCodes.OK).send('You have liked the card.');
      });
    });
  } else {
    return res
      .status(StatusCodes.OK)
      .send('You are not authorized to like a card.');
  }
};

//Controller 4
const getLikedCards = async (req, res) => {
  try {
    if (req.user.role === 'user') {
      const { key, batch, batchSize } = req.query;
      let batchNumber = batch || 1;
      const batchSizeFound = batchSize || 12;
      const user = await User.findById(req.user.id, { likedCards: 1, _id: 0 });
      let cards = [];
      if (key === 'detail') {
        const cardIds = user.likedCards.slice(
          (batchNumber - 1) * batchSizeFound,
          batchNumber * batchSizeFound
        );
        cards = await Card.find({ _id: { $in: cardIds } }, { vector: 0 });
        return res.status(StatusCodes.OK).json(cards);
      }
      return res.status(StatusCodes.OK).json({ likedCards: user.likedCards });
    } else {
      return res
        .status(StatusCodes.OK)
        .send('You are not authorized to read the liked cards.');
    }
  } catch (error) {
    console.log(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send('Error occured while fetching the liked cards.');
  }
};

//Controller 5
const getCardFromId = async (req, res) => {
  const { cardId } = req.body;
  let card = await Card.findById(cardId);
  return res.status(StatusCodes.OK).json(card);
};

//Controller 6
const getCardsOfUser = async (req, res) => {
  try {
    const { userId } = req.query;
    const user = await User.findById(userId, {
      cards: 1,
      clubs: 1,
      communitiesPartOf: 1,
      role: 1,
      badges: 1,
      _id: 0,
    }).lean();
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).send('User not found');
    }
    const cardIds = user.cards;
    const clubIds = user.clubs.map((club) => club.clubId.toString());
    const communityIds = user.communitiesPartOf.map((community) =>
      community.communityId.toString()
    );
    const badgeIds = user.badges;
    const [cardData, clubData, communityData, badges] = await Promise.all([
      Card.find({ _id: { $in: cardIds } }, { vector: 0 }).lean(),
      Club.find({ _id: { $in: clubIds } }, { name: 1, secondaryImg: 1 }).lean(),
      Community.find(
        { _id: { $in: communityIds } },
        { title: 1, secondaryCover: 1 }
      ).lean(),
      Badge.find({ _id: { $in: badgeIds } }).lean(),
    ]);
    return res.status(StatusCodes.OK).json({
      cardData,
      clubData,
      communityData,
      role: user.role,
      badges,
    });
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send('An error occurred while fetching user cards.');
  }
};

//Controller 7
const getCardsFromTag = async (req, res) => {
  const { tag } = req.body;
  const cards = await Card.find({ tags: new RegExp(tag, 'i', 'g') }).sort({
    time: '-1',
  });
  let finalData = [];
  let len = cards.length;
  for (let i = 0; i < len; i++) {
    let card = cards[i]._doc;
    let id = card.creator;
    let userInfo = await User.findById(id, { name: 1, image: 1, _id: 0 });
    let data = {
      ...card,
      creatorName: userInfo.name,
      creatorPic: userInfo.image,
    };
    finalData.push(data);
  }
  return res.status(StatusCodes.OK).json(finalData);
};

//Controller 8
const saveInterest = async (req, res) => {
  if (req.user.role === 'user') {
    const { interests } = req.body;
    let lemmantized = lemmatize(interests);
    User.findById(req.user.id, (err, user) => {
      if (err) return console.error(err);
      user.interests = [];
      user.interests = lemmantized;
      user.save((err, update) => {
        if (err) return console.error(err);
        return res
          .status(StatusCodes.OK)
          .send('Successfully updated interests.');
      });
    });
  } else {
    return res
      .status(StatusCodes.OK)
      .send('You are not authorized to save interests.');
  }
};

//Controller 9
const getYourInterests = async (req, res) => {
  if (req.user.role === 'user') {
    let user = await User.findById(req.user.id, {
      name: 1,
      image: 1,
      interests: 1,
      cards: 1,
      _id: 0,
    });
    let cards = user.cards;
    let len = cards.length;
    let cardData = [];
    for (let i = 0; i < len; i++) {
      let card = cards[i];
      let cardDataPoint = await Card.findById(card);
      if (cardDataPoint) {
        cardData.push(cardDataPoint);
      }
    }
    return res.status(StatusCodes.OK).json({
      profile: {
        name: user.name,
        image: user.image,
        interests: user.interests,
      },
      cardData,
    });
  } else {
    return res
      .status(StatusCodes.OK)
      .send('You are not authorized to read interests.');
  }
};

//Controller 10
const getAllCards = async (req, res) => {
  const { key } = req.query;
  const cards = await Card.find({}).limit(key);
  let finalData = [];
  let len = cards.length;
  for (let i = 0; i < len; i++) {
    let card = cards[i]._doc;
    let id = card.creator;
    let userInfo = await User.findById(id, { name: 1, image: 1, _id: 0 });
    let data = {
      ...card,
      creatorName: userInfo.name,
      creatorPic: userInfo.image,
    };
    finalData.push(data);
  }
  return res.status(StatusCodes.OK).json(finalData);
};

//Controller 11
const unlikeACard = async (req, res) => {
  if (req.user.role === 'user') {
    const { cardId } = req.body;
    User.findById(req.user.id, (err, user) => {
      if (err) return console.error(err);
      let likedCards = user.likedCards;
      likedCards = likedCards.filter((item) => item !== cardId);
      user.likedCards = [];
      user.likedCards = [...likedCards];
      user.save();
    });
    Card.findById(cardId, (err, card) => {
      if (err) return console.error(err);
      let likedBy = card.likedBy;
      likedBy = likedBy.filter((item) => item !== req.user.id);
      card.likedBy = [];
      card.likedBy = [...likedBy];
      card.save((err, update) => {
        if (err) return console.error(err);
        return res
          .status(StatusCodes.OK)
          .send('Successfully disliked the card.');
      });
    });
  } else {
    return res
      .status(StatusCodes.OK)
      .send('You are not authorized to dislike a card.');
  }
};

//Controller 12
const getUserBio = async (req, res) => {
  if (req.user.role === 'user' || req.user.role === 'admin') {
    const { userId } = req.query;
    User.findById(userId, (err, user) => {
      if (err) return console.error(err);
      let data = { name: '', image: '', course: '', clubsNo: 0 };
      data.name = user.name;
      data.image = user.image;
      data.course = user.course;
      data.clubsNo = user.communitiesPartOf.length;
      return res.status(StatusCodes.OK).json(data);
    });
  } else {
    return res
      .status(StatusCodes.OK)
      .send('You are not authorized to read the bio of user.');
  }
};

//Controller 13
const getPeopleRelatedToYou = async (req, res) => {
  try {
    const { interests } = req.query;
    let dataPoints = [];
    if (interests) {
      dataPoints = JSON.parse(interests);
      console.log('dp', dataPoints);
    } else {
      const user = await User.findById(req.user.id, { interests: 1, _id: 0 });
      dataPoints = user.interests;
    }
    let allTags = await getRelatedTags(dataPoints);
    let finalData = await User.find(
      { interests: { $in: allTags } },
      { name: 1, image: 1, _id: 1, pushToken: 1, course: 1 }
    );
    let uniqueData = [];
    let seenNames = new Set();
    finalData.forEach((user) => {
      if (!seenNames.has(user.name)) {
        seenNames.add(user.name);
        uniqueData.push(user);
      }
    });
    const sample = await User.aggregate([
      { $sample: { size: 6 } },
      { $project: { name: 1, image: 1, _id: 1, pushToken: 1, course: 1 } },
    ]);
    uniqueData = [...sample, ...uniqueData];
    return res.status(StatusCodes.OK).json(uniqueData);
  } catch (error) {
    console.log(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send('Error finding people');
  }
};

//Controller 14
const getRandomCards = async (req, res) => {
  const cards = await Card.aggregate([{ $sample: { size: 15 } }]);
  let finalData = [];
  let len = cards.length;
  for (let i = 0; i < len; i++) {
    let card = cards[i];
    let id = card.creator;
    let userInfo = await User.findById(id, {
      name: 1,
      image: 1,
      _id: 0,
      pushToken: 1,
    });
    if (userInfo) {
      let data = {
        ...card,
        creatorName: userInfo.name,
        creatorPic: userInfo.image,
        userPushToken: userInfo.pushToken,
      };
      finalData.push(data);
    }
  }
  return res.status(StatusCodes.OK).json(finalData);
};

//Controller 15
const indexedReturn = async (req, res) => {
  let { query, mode } = req.body;
  let feedCards = await User.findById(req.user.id, {
    cardFeed: 1,
    _id: 0,
    interests: 1,
  });
  feedCards = feedCards.cardFeed || [];
  let lemmatizedTags = lemmatize(query);
  let allTags = await getRelatedTags(lemmatizedTags);
  if (allTags.length > 12) {
    allTags = allTags.sort(() => Math.random() - 0.5).slice(0, 12);
  }
  let uniqueCards = new Set(feedCards.map((card) => card._id.toString()));
  let relatedCards = [];
  const cardPromises = allTags.map((tag) => {
    let pipeline = [
      { $match: { tags: { $regex: new RegExp(tag, 'i') } } },
      { $project: { vector: 0 } },
      { $limit: 6 },
    ];
    return Card.aggregate(pipeline);
  });
  let cardsArray = await Promise.all(cardPromises);
  cardsArray.forEach((cards) => {
    cards.forEach((card) => {
      let cardId = card._id.toString();
      if (!uniqueCards.has(cardId)) {
        uniqueCards.add(cardId);
        const transformedCard = {
          ...card,
          creatorName: card.userMetaData.name,
          creatorPic: card.userMetaData.image,
          userPushToken: card.userMetaData.pushToken,
        };
        relatedCards.push(transformedCard);
      }
    });
  });
  let cards = [...feedCards, ...relatedCards];
  if (mode !== 'search') {
    let remaining = 12 - cards.length;
    if (remaining > 0) {
      let moreCards = await Card.aggregate([
        { $sample: { size: remaining } },
        { $project: { vector: 0 } },
      ]);
      cards.push(...moreCards);
    }
  }

  return res.status(StatusCodes.OK).json(cards);
};

//function to get interested users for the feed
async function getRelatedUsersForFeed(query) {
  let finalData = await getRelatedTags(query);
  let uniqueUsers = new Set();
  let pipeline2 = [
    {
      $match: {
        interests: {
          $in: finalData.map((interest) => new RegExp(interest, 'i')),
        },
      },
    },
    {
      $project: {
        _id: 1,
      },
    },
  ];
  let users = await User.aggregate(pipeline2);
  users.forEach((user) => uniqueUsers.add(user._id.toString()));
  return Array.from(uniqueUsers);
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const vectorEmbedding = async (req, res) => {
  // const url = 'https://api.openai.com/v1/embeddings';
  try {
    let cards = await Card.find({});
    for (let i = 0; i < cards.length; i++) {
      let card = cards[i];
      let text = card.value;
      // const embedding = await axios.post(
      //   url,
      //   {
      //     input: text,
      //     model: 'text-embedding-3-small',
      //   },
      //   {
      //     headers: {
      //       Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      //       'Content-Type': 'application/json',
      //     },
      //   }
      // );

      const embedding = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
        encoding_format: 'float',
      });

      console.log('embedding', embedding.data[0].embedding);
      card.vector = embedding.data[0].embedding;
      card.save();
    }
    return res.status(StatusCodes.OK).send('Successful');
  } catch (error) {
    console.log(error.message);
    return res.status(StatusCodes.OK).send('Something went wrong.');
  }
};

const vectorQuery = async (req, res) => {
  // const url = 'https://api.openai.com/v1/embeddings';
  const { query } = req.query;
  try {
    // const embedding = await axios.post(
    //   url,
    //   {
    //     input: query,
    //     model: 'text-embedding-3-small',
    //   },
    //   {
    //     headers: {
    //       Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    //       'Content-Type': 'application/json',
    //     },
    //   }
    // );

    const embedding = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query,
      encoding_format: 'float',
    });

    const cards = await Card.aggregate([
      {
        $vectorSearch: {
          queryVector: embedding.data[0].embedding,
          path: 'vector',
          numCandidates: 100,
          limit: 5,
          index: 'vector',
        },
      },
      {
        $project: {
          value: 1,
        },
      },
    ]);
    return res.status(StatusCodes.OK).json(cards);
  } catch (error) {
    console.log(error.message);
    return res.status(StatusCodes.OK).send('Something went wrong.');
  }
};

const redundant = async (req, res) => {
  try {
    const resources = await Resource.find({});
    for (let i = 0; i < resources.length; i++) {
      const resource = resources[i];
      const publisher = await User.findById(resource.submittedBy, {
        name: 1,
        image: 1,
        pushToken: 1,
        _id: 0,
      });
      resource.publisherMetaData = publisher;
      await resource.save();
    }
    return res.status(StatusCodes.OK).send('Done');
  } catch (error) {
    console.error('Error updating user professions:', error.message);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: 'Something went wrong.',
      error: error.message,
    });
  }
};

module.exports = {
  redundant,
  vectorQuery,
  vectorEmbedding,
  createCard,
  deleteCard,
  likeACard,
  getLikedCards,
  getCardFromId,
  getCardsOfUser,
  getCardsFromTag,
  saveInterest,
  getYourInterests,
  getAllCards,
  unlikeACard,
  getUserBio,
  getPeopleRelatedToYou,
  getRandomCards,
  indexedReturn,
};
