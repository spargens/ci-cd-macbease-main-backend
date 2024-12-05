const { StatusCodes } = require('http-status-codes');
const Bag = require('../models/bag');
const Unsorted = require('../models/unsorted');

//Controller 1
const createBag = async (req, res) => {
  if (req.user.role === 'admin') {
    const { keyWords, title, unsorted } = req.body;
    const bag = await Bag.create({ keyWords, title });
    const abc = await Unsorted.findOneAndDelete({
      word: new RegExp(keyWords[0], 'i'),
    });
    if (unsorted) {
      await Unsorted.create({ word: unsorted });
    }
    return res.status(StatusCodes.OK).json(bag);
  } else {
    return res
      .status(StatusCodes.OK)
      .send('You are not authorized to create a bag.');
  }
};

//Controller 2
const search = async (req, res) => {
  if (req.user.role === 'admin' || req.user.role === 'user') {
    const { tag } = req.body;
    const regex = new RegExp(tag, 'i', 'g');
    const bags = await Bag.find({});
    let bagTitles = [];
    let len = bags.length;
    for (let i = 0; i < len; i++) {
      let bag = bags[i].keyWords;
      let title = bags[i].title;
      let keys = bag.length;
      for (let j = 0; j < keys; j++) {
        let keyWord = bag[j];
        let found = keyWord.match(regex);
        if (found) {
          bagTitles.push(title);
          break;
        }
      }
    }
    return res.status(StatusCodes.OK).json(bagTitles);
  } else {
    return res
      .status(StatusCodes.OK)
      .send('You are not authorized to insert in bag');
  }
};

//Controller 3
const getAllKeywords = async (req, res) => {
  if (req.user.role === 'admin') {
    const bags = await Bag.find({}, { keyWords: 0 });
    return res.status(StatusCodes.OK).json(bags);
  } else {
    return res
      .status(StatusCodes.OK)
      .send('You are not authorized to read the keywords.');
  }
};

//Controller 4
const unsortedTag = async (req, res) => {
  if (req.user.role === 'admin' || req.user.role === 'user') {
    const { keyWord } = req.body;
    let matched = false;
    const regex = new RegExp(keyWord, 'i', 'g');
    const bags = await Bag.find({});
    let len = bags.length;
    for (let i = 0; i < len; i++) {
      let bag = bags[i].keyWords;
      let keys = bag.length;
      for (let j = 0; j < keys; j++) {
        let existingWord = bag[j];
        let found = existingWord.match(regex);
        if (found) {
          matched = true;
        }
      }
    }
    if (matched) {
      console.log('The word already exists in the bag.');
      return res
        .status(StatusCodes.OK)
        .send('The word already exists in the bag.');
    } else {
      await Unsorted.create({ word: keyWord });
      console.log(
        `The word has been successfully added to the unsorted list.${keyWord}`
      );
      return res
        .status(StatusCodes.OK)
        .send('The word has been successfully added to the unsorted list.');
    }
  } else {
    return res
      .status(StatusCodes.OK)
      .send('You are not authorized to decided the unsorted tags.');
  }
};

//Controller 5
const getUnsortedTags = async (req, res) => {
  if (req.user.role === 'admin') {
    let unsortedWords = await Unsorted.find({});
    return res.status(StatusCodes.OK).json(unsortedWords);
  } else {
    return res
      .status(StatusCodes.OK)
      .send('You are not authorized to access the unsorted keywords.');
  }
};

//Controller 6
const sortATag = async (req, res) => {
  try {
    if (req.user.role === 'admin') {
      const { unsorted, bagTitle } = req.body;

      // Use $addToSet to ensure uniqueness
      let bag = await Bag.findOneAndUpdate(
        { title: bagTitle },
        { $addToSet: { keyWords: unsorted } }, // Only adds if not already present
        { new: true }
      );

      if (!bag) {
        return res.status(StatusCodes.NOT_FOUND).send('Bag not found.');
      }

      // Delete the unsorted word
      await Unsorted.findOneAndDelete({
        word: new RegExp(unsorted, 'i'),
      });

      return res
        .status(StatusCodes.OK)
        .send('The word has been successfully sorted.');
    } else {
      return res
        .status(StatusCodes.FORBIDDEN)
        .send('You are not authorized to sort the tags.');
    }
  } catch (error) {
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send('An error occurred while sorting the word.');
  }
};

//Controller 7
const getKeysFromBag = async (req, res) => {
  if (req.user.role === 'admin' || req.user.role === 'user') {
    const { bagTitle } = req.body;
    let keys = await Bag.findOne({ title: bagTitle }, { keyWords: 1, _id: 0 });
    if (keys) return res.status(StatusCodes.OK).json(keys.keyWords);
    else return res.status(StatusCodes.OK).json([bagTitle]);
  } else {
    return res
      .status(StatusCodes.OK)
      .send('You are not authorized to read keys from the bag.');
  }
};

//Controller 8
const deleteKeyFromBag = async (req, res) => {
  if (req.user.role === 'admin') {
    const { word, bagTitle } = req.body;
    Bag.findOne({ title: bagTitle }, (err, bag) => {
      if (err) return console.error(err);
      let keyWords = bag.keyWords;
      keyWords = keyWords.filter((i) => i !== word);
      bag.keyWords = [];
      bag.keyWords.push(...keyWords);
      bag.save((err, update) => {
        if (err) return console.error(err);
        return res
          .status(StatusCodes.OK)
          .send('Keyword has been successfully deleted.');
      });
    });
  } else {
    return res
      .status(StatusCodes.OK)
      .send('You are not authorized to delete a keyword.');
  }
};

//Controller 9
const deleteABag = async (req, res) => {
  if (req.user.role === 'admin') {
    const { bagId } = req.body;
    let deletedBag = await Bag.findByIdAndDelete(bagId);
    return res
      .status(StatusCodes.OK)
      .send('The bag has been successfully deleted.');
  } else {
    return res
      .status(StatusCodes.OK)
      .send('You are not authorized to delete a bag.');
  }
};

//Controller 10
const deleteUnsortedWord = async (req, res) => {
  if (req.user.role === 'admin') {
    const { word } = req.body;
    await Unsorted.findOneAndDelete({ word });
    return res
      .status(StatusCodes.OK)
      .send('The unsorted word has been successfully deleted.');
  } else {
    return res
      .status(StatusCodes.OK)
      .send('You are not authorized to delete an unsorted word.');
  }
};

//Controller 11
const masterSearch = async (req, res) => {
  const { tag } = req.body;
  let pipeline = [
    {
      $search: {
        index: 'default',
        text: {
          query: `${tag}`,
          path: ['keyWords'],
          fuzzy: {},
        },
      },
    },
  ];
  let bags = await Bag.aggregate(pipeline);
  let len = bags.length;
  let finalData = [];
  for (let i = 0; i < len; i++) {
    let keyWords = bags[i].keyWords;
    finalData.push(...keyWords);
  }
  if (finalData.length === 0) {
    finalData = [tag];
  }
  return res.status(StatusCodes.OK).json(finalData);
};

module.exports = {
  createBag,
  search,
  getAllKeywords,
  unsortedTag,
  getUnsortedTags,
  sortATag,
  getKeysFromBag,
  deleteKeyFromBag,
  deleteABag,
  deleteUnsortedWord,
  masterSearch,
};
