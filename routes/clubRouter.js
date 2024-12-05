const express = require('express');
const router = express.Router();

const {
  createClub,
  deleteClub,
  joinAsMember,
  leaveAsMember,
  addAsMember,
  removeAsMember,
  addAdmin,
  removeAdmin,
  addNotifications,
  deleteNotifications,
  getAllEvents,
  getClub,
  getAllClub,
  postEvent,
  removeEvent,
  postContent,
  removeContent,
  postGallery,
  removeGallery,
  editProfile,
  addTeamMember,
  removeTeamMember,
  getClubsByTag,
  getLikeStatus,
  getLatestContent,
  getClubsPartOf,
  getClubProfile,
  updateRating,
  getClubBio,
  getClubContent,
  getClubGallery,
  getClubVideos,
  isAdmin,
  isMember,
  getClubNotifications,
  isMainAdmin,
  getCreatorId,
  getFastFeed,
  getStatus,
  getFastNativeFeed,
  getAllLikedPins,
  getSimilarGroups,
  getEveryoneOfClub,
  getAllContent,
  getPushTokenChunk,
  changeLeader,
  getClubContributions,
  addProposal,
  fetchProposals,
  changeProposalStatus,
  searchClubProposals,
  nullifyClubDynamicIsland,
  newClubMessage,
} = require('../controllers/clubControllers');

router.post('/createClub', createClub);
router.post('/deleteClub', deleteClub);
router.post('/joinAsMember', joinAsMember);
router.post('/leaveAsMember', leaveAsMember);
router.post('/addAsMember', addAsMember);
router.post('/removeAsMember', removeAsMember);
router.post('/addAdmin', addAdmin);
router.post('/removeAdmin', removeAdmin);
router.post('/addNotifications', addNotifications);
router.post('/deleteNotifications', deleteNotifications);
router.get('/getAllEvents', getAllEvents);
router.post('/getClub', getClub);
router.get('/getAllClub', getAllClub);
router.post('/postEvent', postEvent);
router.post('/removeEvent', removeEvent);
router.post('/postContent', postContent);
router.post('/removeContent', removeContent);
router.post('/postGallery', postGallery);
router.post('/removeGallery', removeGallery);
router.post('/editProfile', editProfile);
router.post('/addTeamMember', addTeamMember);
router.post('/removeTeamMember', removeTeamMember);
router.get('/getClubsByTag', getClubsByTag);
router.get('/getLikeStatus', getLikeStatus);
router.get('/getLatestContent', getLatestContent);
router.get('/getClubsPartOf', getClubsPartOf);
router.get('/getClubProfile', getClubProfile);
router.get('/updateRating', updateRating);
router.get('/getClubBio', getClubBio);
router.get('/getClubContent', getClubContent);
router.get('/getClubGallery', getClubGallery);
router.get('/getClubVideos', getClubVideos);
router.get('/isAdmin', isAdmin);
router.get('/isMember', isMember);
router.get('/getClubNotifications', getClubNotifications);
router.get('/isMainAdmin', isMainAdmin);
router.get('/getCreatorId', getCreatorId);
router.get('/getFastFeed', getFastFeed);
router.get('/getStatus', getStatus);
router.get('/getFastNativeFeed', getFastNativeFeed);
router.get('/getAllLikedPins', getAllLikedPins);
router.get('/getSimilarGroups', getSimilarGroups);
router.get('/getEveryoneOfClub', getEveryoneOfClub);
router.get('/getAllContent', getAllContent);
router.get('/getPushTokenChunk', getPushTokenChunk);
router.patch('/changeLeader', changeLeader);
router.get('/getClubContributions', getClubContributions);
router.post('/addProposal', addProposal);
router.get('/fetchProposals', fetchProposals);
router.post('/changeProposalStatus', changeProposalStatus);
router.get('/searchClubProposals', searchClubProposals);
router.get('/nullifyClubDynamicIsland', nullifyClubDynamicIsland);
router.post('/newClubMessage', newClubMessage);

module.exports = router;
