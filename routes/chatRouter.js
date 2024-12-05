const express = require('express');
const router = express.Router();
const {
  createNewChatRoom,
  getAllChatRooms,
  markAsUnread,
  markAsRead,
  getUnreadRooms,
  checkBlockage,
} = require('../controllers/chatControllers');

router.post('/createNewChatRoom', createNewChatRoom);
router.get('/getAllChatRooms', getAllChatRooms);
router.get('/markAsUnread', markAsUnread);
router.get('/markAsRead', markAsRead);
router.get('/getUnreadRooms', getUnreadRooms);
router.get('/checkBlockage', checkBlockage);

module.exports = router;
