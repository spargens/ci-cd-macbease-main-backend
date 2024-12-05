const { StatusCodes } = require('http-status-codes');
const Invitation = require('../models/invitation');
const User = require('../models/user');
const schedule = require('node-schedule');
const mongoose = require('mongoose');
const { scheduleNotification, pingAdmins } = require('../controllers/utils');

//Controller 1
const createInvitation = async (req, res) => {
  const { sentTo, action, text, img1, img2, type, subject } = req.body;
  if (!sentTo || !action || !text || !type) {
    return res.status(StatusCodes.OK).send('Incomplete data.');
  }
  try {
    const currentDate = new Date();
    const futureDate = new Date(
      currentDate.getTime() + 7 * 24 * 60 * 60 * 1000
    );
    const invitation = await Invitation.create({
      ...req.body,
      sentBy: req.user.id,
      expiration: futureDate,
    });
    if (type === 'Content Team Application') {
      const scheduleTime = new Date(Date.now() + 3000);
      schedule.scheduleJob(
        `contentCreatorApplication_${invitation._id}`,
        scheduleTime,
        async () => {
          await pingAdmins({
            role: 'Content Team',
            pingLevel: 2,
            notification: {
              title: 'Hello Macbease Content Team!',
              body: 'We have got new application for content creator!',
              img1,
              img2,
              key: 'invitation',
              action: 'invitation',
              params: {
                invitationId: invitation._id,
                action,
              },
            },
            email: {
              intro:
                'We have got a new application for Content Creator post. Please review the application.',
              outro: 'Our team is getting bigger and stronger.',
              subject: 'Content Creator Application',
            },
          });
        }
      );
    } else {
      let receiver = await User.findById(sentTo, { unreadNotice: 1 });
      const notice = {
        value: subject ? subject : `Proposal- ${text}`,
        img1,
        img2,
        key: 'invitation',
        action: 'invitation',
        params: {
          invitationId: invitation._id,
          action,
        },
        time: new Date(),
        uid: `${new Date()}/${receiver._id}/${req.user.id}`,
      };
      receiver.unreadNotice = [notice, ...receiver.unreadNotice];
      receiver.save();
    }
    return res
      .status(StatusCodes.OK)
      .json({ msg: 'Invitation created successfully.', id: invitation._id });
  } catch (error) {
    console.error(error);
    return res.status(StatusCodes.OK).send('Something went wrong.');
  }
};

//Controller
const getInvitationInfo = async (req, res) => {
  const { invitationId } = req.query;
  try {
    const invitation = await Invitation.findById(invitationId);
    const userId = invitation.sentBy;
    const userInfo = await User.findById(userId, {
      name: 1,
      image: 1,
      pushToken: 1,
    });
    const finalData = { invitation, userInfo };
    return res.status(StatusCodes.OK).json(finalData);
  } catch (error) {
    console.error(error);
    return res.status(StatusCodes.OK).send('Something went wrong.');
  }
};

//Controller 3
const declineInvitation = async (req, res) => {
  const { invitationId } = req.query;
  try {
    let invitation = await Invitation.findById(invitationId, {
      sentBy: 1,
      sentTo: 1,
      expiration: 1,
      state: 1,
      subject: 1,
      cc: 1,
    });
    if (!invitation) {
      return res.status(StatusCodes.NOT_FOUND).send('Invitation not found.');
    }
    if (invitation.state !== 'undecided') {
      return res
        .status(StatusCodes.OK)
        .send('Proposal has already been nullified.');
    }
    if (
      ![...invitation.cc, invitation.sentTo.toString()].includes(req.user.id)
    ) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .send('You are not authorized to reject this proposal.');
    }

    invitation.state = 'rejected';
    invitation.save();

    //scheduling notification
    let oneSec = new Date(Date.now() + 1000);
    schedule.scheduleJob(
      `proposal_decline_${req.user.id}_${invitationId}`,
      oneSec,
      async () => {
        try {
          const users = await User.find(
            {
              _id: {
                $in: [invitation.sentBy, mongoose.Types.ObjectId(req.user.id)],
              },
            },
            { unreadNotice: 1, name: 1, image: 1, pushToken: 1 }
          );
          const sender = users.find((user) =>
            user._id.equals(invitation.sentBy)
          );
          const receiver = users.find((user) =>
            user._id.equals(mongoose.Types.ObjectId(req.user.id))
          );
          if (!sender || !receiver) {
            console.error('Sender or receiver not found.');
            return;
          }
          const noticeSender = {
            value: `Sorry! ${receiver.name} has rejected your proposal- ${invitation.subject}`,
            img1: receiver.image,
            img2: sender.image,
            key: 'read',
            time: new Date(),
            uid: `${new Date()}/${sender._id}/${req.user.id}`,
          };
          const noticeReceiver = {
            value: `Sorry! you have rejected the proposal- ${invitation.subject}`,
            img1: sender.image,
            img2: receiver.image,
            key: 'read',
            time: new Date(),
            uid: `${new Date()}/${sender._id}/${req.user.id}`,
          };
          sender.unreadNotice.unshift(noticeSender);
          receiver.unreadNotice.unshift(noticeReceiver);
          await Promise.all([sender.save(), receiver.save()]);
          scheduleNotification(
            [sender.pushToken],
            'Proposal rejected',
            `Sorry! ${receiver.name} has rejected your proposal- ${invitation.subject}`
          );
        } catch (error) {
          console.error('Error in scheduled notification:', error);
        }
      }
    );

    return res
      .status(StatusCodes.OK)
      .send('Proposal has been successfully declined.');
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send('Something went wrong.');
  }
};

//Controller 4
const endorseInvitation = async (req, res) => {
  const { invitationId } = req.body;
  try {
    const result = await Invitation.findByIdAndUpdate(
      invitationId,
      { $addToSet: { endorsedBy: req.user.id } },
      { new: true, fields: { endorsedBy: 1, sentBy: 1, subject: 1 } }
    );
    if (!result) {
      return res.status(StatusCodes.NOT_FOUND).send('Invitation not found.');
    }
    //sending push and in-app notification
    let oneSec = new Date(Date.now() + 1000);
    schedule.scheduleJob(
      `endorsement_notice_${req.user.id}_${invitationId}`,
      oneSec,
      async () => {
        try {
          const [endorser, recipient] = await Promise.all([
            User.findById(req.user.id, { name: 1, image: 1 }),
            User.findById(result.sentBy, {
              pushToken: 1,
              unreadNotice: 1,
              image: 1,
            }),
          ]);
          if (!endorser || !recipient) {
            console.error('User not found for notification');
            return;
          }
          const notice = {
            value: `Your proposal titled: ${result.subject} was endorsed by ${endorser.name}`,
            img1: recipient.image,
            img2: endorser.image,
            key: 'read',
            time: new Date(),
            uid: `endorsement_notice_${req.user.id}_${invitationId}`,
          };
          recipient.unreadNotice = [notice, ...recipient.unreadNotice];
          await recipient.save();
          scheduleNotification(
            [recipient.pushToken],
            'Proposal endorsed',
            `Your proposal titled: ${result.subject} was endorsed by ${endorser.name}`
          );
        } catch (error) {
          console.error('Error in scheduled notification:', error);
        }
      }
    );

    return res
      .status(StatusCodes.OK)
      .send('Successfully endorsed the proposal.');
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send('Error endorsing proposal.');
  }
};

//Controller 5
const acceptInvitation = async (req, res) => {
  const { invitationId } = req.query;
  try {
    let invitation = await Invitation.findById(invitationId, {
      sentBy: 1,
      sentTo: 1,
      expiration: 1,
      state: 1,
      subject: 1,
      cc: 1,
    });
    if (!invitation) {
      return res.status(StatusCodes.NOT_FOUND).send('Invitation not found.');
    }
    if (invitation.state !== 'undecided') {
      return res
        .status(StatusCodes.OK)
        .send('Proposal has already been nullified.');
    }
    if (
      ![...invitation.cc, invitation.sentTo.toString()].includes(req.user.id)
    ) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .send('You are not authorized to reject this proposal.');
    }

    invitation.state = 'accepted';
    invitation.save();

    //scheduling notification
    let oneSec = new Date(Date.now() + 1000);
    schedule.scheduleJob(
      `proposal_accept_${req.user.id}_${invitationId}`,
      oneSec,
      async () => {
        try {
          const users = await User.find(
            {
              _id: {
                $in: [invitation.sentBy, mongoose.Types.ObjectId(req.user.id)],
              },
            },
            { unreadNotice: 1, name: 1, image: 1, pushToken: 1 }
          );
          const sender = users.find((user) =>
            user._id.equals(invitation.sentBy)
          );
          const receiver = users.find((user) =>
            user._id.equals(mongoose.Types.ObjectId(req.user.id))
          );
          if (!sender || !receiver) {
            console.error('Sender or receiver not found.');
            return;
          }
          const noticeSender = {
            value: `Congratulations! ${receiver.name} has accepted your proposal- ${invitation.subject}`,
            img1: receiver.image,
            img2: sender.image,
            key: 'read',
            time: new Date(),
            uid: `${new Date()}/${sender._id}/${req.user.id}`,
          };
          const noticeReceiver = {
            value: `Congratulations! you have accepted the proposal- ${invitation.subject}`,
            img1: sender.image,
            img2: receiver.image,
            key: 'read',
            time: new Date(),
            uid: `${new Date()}/${sender._id}/${req.user.id}`,
          };
          sender.unreadNotice.unshift(noticeSender);
          receiver.unreadNotice.unshift(noticeReceiver);
          await Promise.all([sender.save(), receiver.save()]);
          scheduleNotification(
            [sender.pushToken],
            'Proposal accepted',
            `Congratulations! ${receiver.name} has accepted your proposal- ${invitation.subject}`
          );
        } catch (error) {
          console.error('Error in scheduled notification:', error);
        }
      }
    );

    return res
      .status(StatusCodes.OK)
      .send('Proposal has been successfully declined.');
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send('Something went wrong.');
  }
};

const getPendingCreatorApplications = async (req, res) => {
  try {
    if (req.user.role === 'admin') {
      const applications = await Invitation.find({
        type: 'Content Team Application',
        state: 'undecided',
      });
      return res.status(StatusCodes.OK).json(applications);
    } else {
      return res
        .status(StatusCodes.MISDIRECTED_REQUEST)
        .send('You are not authorized to access this route.');
    }
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).send('Something went wrong.');
  }
};

module.exports = {
  createInvitation,
  getInvitationInfo,
  declineInvitation,
  endorseInvitation,
  acceptInvitation,
  getPendingCreatorApplications,
};
