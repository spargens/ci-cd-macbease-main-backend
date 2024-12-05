const { StatusCodes } = require('http-status-codes');
const Admin = require('../models/admin');
const MacbeaseContent = require('../models/macbeaseContent');
const Content = require('../models/content');
const User = require('../models/user');
const { sendMail } = require('../controllers/utils');

const submitForReview = async (req, res) => {
  const { cid, type, reason } = req.body;
  try {
    let admin = await Admin.findOne(
      { role: 'Content Moderator' },
      { reviewContent: 1, unreadNotice: 1 }
    );
    if (!admin) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        error:
          'Sorry! Content moderation team is unavailable. Please try again later.',
      });
    }
    admin.reviewContent = [
      {
        cid,
        type,
        status: 0,
        userId: req.user.id,
        timeStamp: new Date(),
        reason,
      },
      ...admin.reviewContent,
    ];
    //code to send in-app notification to user and admin
    let sender = await User.findById(req.user.id, {
      email: 1,
      name: 1,
      image: 1,
      unreadNotice: 1,
    });
    if (type === 'normal') {
      let content = await Content.findById(cid);
      content.underReview = true;
      content.save();
      if (content.sendBy === 'club') {
        const noticeForUser = {
          value: `Post is under review. We will keep you posted about actions we take.`,
          img1: sender.image,
          img2: content.url,
          expandType: 'Club',
          expandData: {
            ...content._doc,
          },
          key: 'tag',
          time: new Date(),
          uid: `${new Date()}/${admin._id}/${req.user.id}`,
        };
        const noticeForAdmin = {
          value: `Content marked for review.`,
          img1: sender.image,
          img2: content.url,
          expandType: 'Club',
          expandData: {
            ...content._doc,
          },
          key: 'tag',
          time: new Date(),
          uid: `${new Date()}/${admin._id}/${req.user.id}`,
        };
        admin.unreadNotice = [noticeForAdmin, ...admin.unreadNotice];
        sender.unreadNotice = [noticeForUser, ...sender.unreadNotice];
      } else if (content.sendBy === 'userCommunity') {
        const noticeForUser = {
          value: `Post is under review. We will keep you posted about actions we take.`,
          img1: sender.image,
          img2: content.url,
          expandType: 'Community',
          expandData: {
            ...content._doc,
          },
          key: 'tag',
          time: new Date(),
          uid: `${new Date()}/${admin._id}/${req.user.id}`,
        };
        const noticeForAdmin = {
          value: `Content marked for review.`,
          img1: sender.image,
          img2: content.url,
          expandType: 'Community',
          expandData: {
            ...content._doc,
          },
          key: 'tag',
          time: new Date(),
          uid: `${new Date()}/${admin._id}/${req.user.id}`,
        };
        admin.unreadNotice = [noticeForAdmin, ...admin.unreadNotice];
        sender.unreadNotice = [noticeForUser, ...sender.unreadNotice];
      }
    } else if (type === 'macbease') {
      let content = await MacbeaseContent.findById(cid);
      content.underReview = true;
      content.save();
      const noticeForUser = {
        value: `Post is under review. We will keep you posted about actions we take.`,
        img1: sender.image,
        img2: content.url,
        expandType: 'Macbease',
        expandData: {
          ...content._doc,
        },
        key: 'tag',
        time: new Date(),
        uid: `${new Date()}/${admin._id}/${req.user.id}`,
      };
      const noticeForAdmin = {
        value: `Content marked for review.`,
        img1: sender.image,
        img2: content.url,
        expandType: 'Macbease',
        expandData: {
          ...content._doc,
        },
        key: 'tag',
        time: new Date(),
        uid: `${new Date()}/${admin._id}/${req.user.id}`,
      };
      admin.unreadNotice = [noticeForAdmin, ...admin.unreadNotice];
      sender.unreadNotice = [noticeForUser, ...sender.unreadNotice];
    }
    admin.save();
    sender.save();
    return res
      .status(StatusCodes.OK)
      .send('Post successfully submitted for review.');
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ error: 'An error occurred while submitting for review.' });
  }
};

const readContentForModeration = async (req, res) => {
  try {
    if (req.user.role === 'admin') {
      const { batch, batchSize } = req.query;
      const admin = await Admin.findById(req.user.id, { reviewContent: 1 });
      let reviewContent = admin.reviewContent;
      if (batch && batchSize) {
        reviewContent = reviewContent.slice(
          (batch - 1) * batchSize,
          batch * batchSize
        );
      }
      let finalData = [];
      for (let i = 0; i < reviewContent.length; i++) {
        const dataPoint = reviewContent[i];
        if (dataPoint.type === 'normal') {
          let content = await Content.findById(dataPoint.cid);
          content.comments = content.comments.slice(0, 6);
          const data = { ...dataPoint, content };
          finalData.push(data);
        } else if (dataPoint.type === 'macbease') {
          let content = await MacbeaseContent.findById(dataPoint.cid);
          content.comments = content.comments.slice(0, 6);
          const data = { ...dataPoint, content };
          finalData.push(data);
        }
      }
      return res.status(StatusCodes.OK).json(finalData);
    } else {
      return res
        .status(StatusCodes.MISDIRECTED_REQUEST)
        .send('You are not authorized to access this route.');
    }
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).json('Something went wrong.');
  }
};

const discardReviewClaim = async (req, res) => {
  try {
    if (req.user.role === 'admin') {
      const { cid, type } = req.body;
      if (type === 'normal') {
        let content = await Content.findById(cid, { underReview: 1 });
        content.underReview = false;
        content.save();
      } else if (type === 'macbease') {
        let content = await MacbeaseContent.findById(cid, { underReview: 1 });
        content.underReview = false;
        content.save();
      }
      let admin = await Admin.findById(req.user.id, { reviewContent: 1 });
      let reviewList = admin.reviewContent;
      let userId = '';
      for (let i = 0; i < reviewList.length; i++) {
        let dataPoint = reviewList[i];
        if (dataPoint.cid === cid) {
          dataPoint.status = 1;
          userId = dataPoint.userId;
          break;
        }
      }
      admin.reviewContent = [];
      admin.reviewContent = reviewList;
      admin.save();
      //code to send review result email
      if (userId) {
        const user = await User.findById(userId, { email: 1, name: 1 });
        const intro = [
          'Thank you for taking out time to report content. This helps us to stick to rigorous community guidelines.',
          `After much consultation, the content has been declared fit for the platform.`,
        ];
        const outro =
          'If you did not report a content, please avoid this email.';
        const subject = 'Content Review Action';
        const destination = [user.email];
        const { ses, params } = await sendMail(
          user.name,
          intro,
          outro,
          subject,
          destination
        );
        ses.sendEmail(params, function (err, data) {
          if (err) {
            console.log(err, err.stack);
            return res.status(StatusCodes.OK).send('Something went wrong.');
          } else {
            return res
              .status(StatusCodes.OK)
              .send('Review discarded successfully.');
          }
        });
      } else {
        return res
          .status(StatusCodes.OK)
          .send('Review discarded successfully.');
      }
    } else {
      return res
        .status(StatusCodes.MISDIRECTED_REQUEST)
        .send('You are not authorized to access this route.');
    }
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ error: 'An error occurred while discarding the review.' });
  }
};

const addDiscretion = async (req, res) => {
  try {
    if (req.user.role === 'admin') {
      const { cid, type, discretion, blur } = req.body;
      if (type === 'normal') {
        let content = await Content.findById(cid, {
          discretion: 1,
          blur: 1,
          underReview: 1,
        });
        content.underReview = false;
        content.discretion = discretion;
        content.blur = blur;
        content.save();
      } else if (type === 'macbease') {
        let content = await MacbeaseContent.findById(cid, {
          discretion: 1,
          blur: 1,
          underReview: 1,
        });
        content.underReview = false;
        content.discretion = discretion;
        content.blur = blur;
        content.save();
      }
      let admin = await Admin.findById(req.user.id, { reviewContent: 1 });
      let reviewList = admin.reviewContent;
      let userId = '';
      for (let i = 0; i < reviewList.length; i++) {
        let dataPoint = reviewList[i];
        if (dataPoint.cid === cid) {
          dataPoint.status = 1;
          userId = dataPoint.userId;
          break;
        }
      }
      admin.reviewContent = [];
      admin.reviewContent = reviewList;
      admin.save();
      return res.status(StatusCodes.OK).send('Discretion added successfully.');
    } else {
      return res
        .status(StatusCodes.MISDIRECTED_REQUEST)
        .send('You are not authorized to access this route.');
    }
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ error: 'An error occurred while submitting the descretion.' });
  }
};

module.exports = {
  submitForReview,
  readContentForModeration,
  discardReviewClaim,
  addDiscretion,
};
