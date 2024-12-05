const mongoose = require('mongoose');
const { StatusCodes } = require('http-status-codes');
const User = require('../models/user');
const { updateDynamicIsland, scheduleNotification2 } = require('./utils');

//Controller 1
const createNewChatRoom = async (req, res) => {
  try {
    const { doc_id } = req.body;
    const [firstId, secondId] = doc_id.split('-');
    const myId = req.user.id;
    const hisId = firstId === myId ? secondId : firstId;

    const updateChatRooms = async (userId, state) => {
      const user = await User.findById(userId);
      if (!user) throw new Error(`User with ID ${userId} not found.`);
      const chatRoomIndex = user.chatRooms.findIndex(
        (room) => room.doc_id === doc_id
      );
      if (chatRoomIndex === -1) {
        user.chatRooms.unshift({ doc_id, state });
      } else {
        const [existingRoom] = user.chatRooms.splice(chatRoomIndex, 1);
        user.chatRooms.unshift(existingRoom);
      }
      await user.save();
    };

    await updateChatRooms(myId, 'read');
    await updateChatRooms(hisId, 'unread');

    return res
      .status(StatusCodes.OK)
      .send('Successfully created new chat room.');
  } catch (error) {
    console.error('Error creating chat room:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send('Failed to create new chat room.');
  }
};

//Controller 2
const getAllChatRooms = async (req, res) => {
  if (req.user.role === 'user') {
    const rooms = await User.findById(req.user.id, { chatRooms: 1, _id: 0 });
    return res.status(StatusCodes.OK).json(rooms.chatRooms);
  }
};

//Controller 3
const markAsUnread = async (req, res) => {
  try {
    const { doc_id, message } = req.query;
    let ids = doc_id.split('-');
    let myId = req.user.id;
    const senderDetails = await User.findById(myId, {
      name: 1,
      image: 1,
      pushToken: 1,
    });
    let hisId = ids[0] === myId ? ids[1] : ids[0];
    if (!hisId) {
      return res
        .status(StatusCodes.INTERNAL_SERVER_ERROR)
        .send('Invalid user id.');
    }
    const user = await User.findById(hisId, {
      chatRooms: 1,
      shortCuts: 1,
      pushToken: 1,
    });
    let chatRooms = user.chatRooms;
    let index = chatRooms.findIndex((item) => item.doc_id === doc_id);
    let matchedItem = chatRooms[index];
    if (matchedItem) {
      matchedItem.state = 'unread';
      chatRooms = chatRooms.filter((item) => item.doc_id !== doc_id);
      chatRooms = [matchedItem, ...chatRooms];
    }
    user.chatRooms = [];
    user.chatRooms = chatRooms;
    await user.save();
    if (user.shortCuts.some((item) => item.id.toString() === myId)) {
      await updateDynamicIsland(
        [mongoose.Types.ObjectId(hisId)],
        myId,
        'messages',
        true
      );
    }
    if (message) {
      scheduleNotification2({
        pushToken: [user.pushToken],
        title: `Message from ${senderDetails.name}`,
        body: message,
        url: `https://macbease-website.vercel.app/app/chat/${senderDetails._id}/${senderDetails.name}/${senderDetails.pushToken}/${senderDetails.image}`,
      });
    }
    return res
      .status(StatusCodes.OK)
      .send('The chat room has been marked unread.');
  } catch (error) {
    console.log('chat room error', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send('Something went wrong.');
  }
};

//Controller 4
const markAsRead = async (req, res) => {
  const { doc_id } = req.query;
  let myId = req.user.id;
  User.findById(myId, (err, user) => {
    if (err) return console.error(err);
    let chatRooms = user.chatRooms;
    let index = chatRooms.findIndex((item) => item.doc_id === doc_id);
    if (index !== -1) {
      let matchedItem = chatRooms[index];
      matchedItem.state = 'read';
      chatRooms = chatRooms.filter((item) => item.doc_id !== doc_id);
      chatRooms = [matchedItem, ...chatRooms];
      user.chatRooms = [];
      user.chatRooms = chatRooms;
    }
    user.save((err, update) => {
      if (err) return console.error(err);
      return res
        .status(StatusCodes.OK)
        .send('The chat room has been marked read.');
    });
  });
};

//Controller 5
const getUnreadRooms = async (req, res) => {
  const user = await User.findById(req.user.id, { chatRooms: 1, _id: 0 });
  if (user) {
    let chatRooms = user.chatRooms;
    chatRooms = chatRooms.filter((element) => element.state === 'unread');
    return res.status(StatusCodes.OK).json(chatRooms);
  } else {
    return res.status(StatusCodes.OK).send('User does not exist.');
  }
};

const checkBlockage = async (req, res) => {
  const { secondaryId } = req.query;
  try {
    const primary = await User.findById(req.user.id, { blockList: 1, _id: 0 });
    const secondary = await User.findById(secondaryId, {
      blockList: 1,
      _id: 0,
    });
    const primaryBlockList = primary.blockList;
    const secondaryBlockList = secondary.blockList;
    let youHaveBlocked = false;
    let receiverHasBlocked = false;
    for (let i = 0; i < primaryBlockList.length; i++) {
      const point = primaryBlockList[i];
      if (point.id === secondaryId) {
        youHaveBlocked = true;
      }
    }
    for (let i = 0; i < secondaryBlockList.length; i++) {
      const point = secondaryBlockList[i];
      if (point.id === req.user.id) {
        receiverHasBlocked = true;
      }
    }
    return res
      .status(StatusCodes.OK)
      .json({ youHaveBlocked, receiverHasBlocked });
  } catch (error) {
    return res.status(StatusCodes.OK).send('Something went wrong.');
  }
};

module.exports = {
  createNewChatRoom,
  getAllChatRooms,
  markAsUnread,
  markAsRead,
  getUnreadRooms,
  checkBlockage,
};
