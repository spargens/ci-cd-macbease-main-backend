const mongoose = require('mongoose');
const invitationSchema = new mongoose.Schema({
  sentBy: {
    type: mongoose.Types.ObjectId,
  },
  sentTo: {
    type: mongoose.Types.ObjectId,
  },
  cc: {
    type: Array,
  },
  senderDesignation: {
    type: String,
  },
  type: {
    type: String,
    enum: [
      'Leader Change',
      'Promotion',
      'Proposal',
      'Content Team Application',
    ],
  },
  expiration: {
    type: Date,
  },
  state: {
    type: String,
    enum: ['undecided', 'accepted', 'rejected', 'expired'],
    default: 'undecided',
  },
  text: {
    type: String,
  },
  action: {
    type: Object,
  },
  attachedFile: {
    type: Array,
  },
  subject: {
    type: String,
  },
  endorsedBy: {
    type: Array,
  },
});

module.exports = mongoose.model('Invitation', invitationSchema);
