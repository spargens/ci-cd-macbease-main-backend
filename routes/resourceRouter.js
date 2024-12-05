const express = require('express');
const router = express.Router();

const {
  createResource,
  getResources,
  submitReview,
  getReviews,
  getResource,
  logResourceDownload,
  searchResources,
  deleteResource,
  getRecommendedNotes,
  searchFromAllResources,
} = require('../controllers/resourceControllers');

router.post('/createResource', createResource);
router.get('/getResources', getResources);
router.post('/submitReview', submitReview);
router.get('/getReviews', getReviews);
router.get('/getResource', getResource);
router.get('/logResourceDownload', logResourceDownload);
router.get('/searchResources', searchResources);
router.delete('/deleteResource', deleteResource);
router.get('/getRecommendedNotes', getRecommendedNotes);
router.get('/searchFromAllResources', searchFromAllResources);

module.exports = router;
