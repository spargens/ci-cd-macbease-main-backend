const express = require('express');
const router = express.Router();

const {
  generateTicket,
  scanTicket,
  reviewEvent,
  likeReview,
  unLikeReview,
} = require('../controllers/ticketControllers');

router.post('/generateTicket', generateTicket);
router.post('/scanTicket', scanTicket);
router.post('/reviewEvent', reviewEvent);
router.get('/likeReview', likeReview);
router.get('/unlikeReview', unLikeReview);

module.exports = router;
