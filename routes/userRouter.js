const express = require('express');
const router = express.Router();
const {
  getUser,
  updateUser,
  deleteUser,
  getUserByToken,
  searchUserByName,
  getUserBio,
  advanceSearch,
  getAllUsers,
  randomUsers,
  changePassword,
  pushPermanentNotice,
  getPermanentNotices,
  deleteNotifications,
  getCommunitiesForPost,
  getPermanentNoticeInBatch,
  sendMailToUsers,
  getBasicUserBio,
  sendNotification,
  deactivateAccount,
  cleanUp,
  search,
  fetchMultipleProfiles,
  tuneIn,
  untune,
  getProfessorRecommendations,
  searchFromAllProfessors,
} = require('../controllers/userControllers');

router.route('/').get(getUser).patch(updateUser).delete(deleteUser);
router.get('/getUserByToken', getUserByToken);
router.get('/searchUserByName', searchUserByName);
router.get('/getUserBio', getUserBio);
router.get('/advanceSearch', advanceSearch);
router.get('/getAllUsers', getAllUsers);
router.get('/randomUsers', randomUsers);
router.post('/changePassword', changePassword);
router.post('/pushPermanentNotice', pushPermanentNotice);
router.get('/getPermanentNotices', getPermanentNotices);
router.post('/deleteNotifications', deleteNotifications);
router.get('/getCommunitiesForPost', getCommunitiesForPost);
router.get('/getPermanentNoticeInBatch', getPermanentNoticeInBatch);
router.post('/sendMailToUsers', sendMailToUsers);
router.get('/getBasicUserBio', getBasicUserBio);
router.post('/sendNotification', sendNotification);
router.post('/deactivateAccount', deactivateAccount);
router.post('/cleanUp', cleanUp);
router.get('/search', search);
router.post('/fetchMultipleProfiles', fetchMultipleProfiles);
router.get('/tuneIn', tuneIn);
router.get('/untune', untune);
router.get('/getProfessorRecommendations', getProfessorRecommendations);
router.get('/searchFromAllProfessors', searchFromAllProfessors);

module.exports = router;
