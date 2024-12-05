const express = require('express');
const router = express.Router();

const {
  createEvent,
  deleteEvent,
  getAllEvents,
  changeEventStatus,
  addClubEvent,
  getTicketsBought,
  getEventAnalytics,
  getCustomAnalytics,
  addPredefinedQues,
  removePredefinedQues,
  askQuestion,
  answerTheQuestion,
  getFaq,
  changeStatusJob,
  getTickets,
  generateTicketListPdf,
  getReviews,
  checkTicketAvailability,
  checkLiveAttendance,
  askForReviewSubmission,
  getAllTicketsBought,
  getEvents
} = require('../controllers/eventControllers');

router.post('/createEvent', createEvent);
router.post('/deleteEvent', deleteEvent);
router.get('/getAllEvents', getAllEvents);
router.get('/changeEventStatus', changeEventStatus);
router.post('/addClubEvent', addClubEvent);
router.get('/getTicketsBought', getTicketsBought);
router.get('/getEventAnalytics', getEventAnalytics);
router.get('/getCustomAnalytics', getCustomAnalytics);
router.post('/addPredefinedQues', addPredefinedQues);
router.post('/removePredefinedQues', removePredefinedQues);
router.post('/askQuestion', askQuestion);
router.post('/answerTheQuestion', answerTheQuestion);
router.get('/getFaq', getFaq);
router.get('/changeStatusJob', changeStatusJob);
router.get('/getTickets', getTickets);
router.get('/generateTicketListPdf', generateTicketListPdf);
router.get('/getReviews', getReviews);
router.get('/checkTicketAvailability', checkTicketAvailability);
router.get('/checkLiveAttendance', checkLiveAttendance);
router.get('/askForReviewSubmission', askForReviewSubmission);
router.get('/getAllTicketsBought', getAllTicketsBought);
router.get('/getEvents', getEvents);

module.exports = router;
