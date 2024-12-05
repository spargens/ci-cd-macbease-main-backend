const express = require('express');
const router = express.Router();

const {
  createContent,
  likeContent,
  comment,
  unlikeContent,
  deleteContent,
  getContent,
  getComments,
  getContentBySpan,
  getLikeStatus,
  getMacbeaseContribution,
  addToContentTeam,
  readContentTeam,
  removeFromTeam,
  getPopularComments,
  likeAComment,
  unLikeAComment,
  getBatchedContent,
  getDateWiseContent,
  tagSearchContent,
  editContent,
  replyToComment,
  getContentTeamAdmins,
} = require('../controllers/macbeaseContentControllers');

router.post('/createContent', createContent);
router.post('/likeContent', likeContent);
router.post('/comment', comment);
router.post('/unlikeContent', unlikeContent);
router.post('/deleteContent', deleteContent);
router.get('/getContent', getContent);
router.get('/getContent', getContent);
router.get('/getComments', getComments);
router.get('/getContentBySpan', getContentBySpan);
router.get('/getLikeStatus', getLikeStatus);
router.get('/getMacbeaseContribution', getMacbeaseContribution);
router.get('/addToContentTeam', addToContentTeam);
router.get('/readContentTeam', readContentTeam);
router.get('/removeFromTeam', removeFromTeam);
router.get('/getPopularComments', getPopularComments);
router.get('/likeAComment', likeAComment);
router.get('/unLikeAComment', unLikeAComment);
router.get('/getBatchedContent', getBatchedContent);
router.get('/getDateWiseContent', getDateWiseContent);
router.get('/tagSearchContent', tagSearchContent);
router.patch('/editContent', editContent);
router.post('/replyToComment', replyToComment);
router.get('/getContentTeamAdmins', getContentTeamAdmins);
module.exports = router;
