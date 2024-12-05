const express = require('express');
const router = express.Router();

const {
  createInvitation,
  getInvitationInfo,
  declineInvitation,
  endorseInvitation,
  acceptInvitation,
  getPendingCreatorApplications,
} = require('../controllers/invitationController');

router.post('/createInvitation', createInvitation);
router.get('/getInvitationInfo', getInvitationInfo);
router.get('/declineInvitation', declineInvitation);
router.post('/endorseInvitation', endorseInvitation);
router.get('/acceptInvitation', acceptInvitation);
router.get('/getPendingCreatorApplications', getPendingCreatorApplications);

module.exports = router;
