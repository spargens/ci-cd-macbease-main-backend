const { StatusCodes } = require('http-status-codes');
const User = require('../models/user');
const Admin = require('../models/admin');
const bcrypt = require('bcryptjs');
const Community = require('../models/community');
const Club = require('../models/club');
const {
  sendMail,
  scheduleNotification,
  updateDynamicIsland,
  scheduleNotification2,
} = require('../controllers/utils');
const { default: mongoose } = require('mongoose');
require('dotenv').config();

const securePassword = async (password) => {
  try {
    const hash = await bcrypt.hash(password, 10);
    return hash;
  } catch (error) {
    console.log(error);
  }
};

//Controller 1
const searchUserByName = async (req, res) => {
  const { name } = req.query;
  const users = await User.find(
    { name: new RegExp(name, 'i', 'g') },
    { name: 1, image: 1, _id: 1 }
  );
  const adminUsers = await Admin.find(
    { name: new RegExp(name, 'i', 'g') },
    { name: 1, image: 1, _id: 1 }
  );
  let finalData = [...users, ...adminUsers];
  return res.status(StatusCodes.OK).json(finalData);
};

//Controller 2
const getUserBio = async (req, res) => {
  try {
    const user = await User.findById(req.user.id, {
      course: 1,
      role: 1,
      interests: 1,
      clubs: 1,
      communitiesCreated: 1,
      communitiesPartOf: 1,
      giftsSend: 1,
      name: 1,
      image: 1,
      chatRooms: 1,
      email: 1,
      unreadNotice: 1,
      level: 1,
      passoutYear: 1,
      field: 1,
      incompleteProfile: 1,
      notifications: 1,
      shortCuts: 1,
    });
    if (!user) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ message: 'User not found' });
    }
    if (user.notifications.length > 30) {
      user.notifications = user.notifications.slice(0, 30);
      await user.save();
    }
    const {
      course,
      role,
      interests,
      clubs,
      communitiesCreated,
      communitiesPartOf,
      giftsSend,
      name,
      image,
      chatRooms,
      email,
      unreadNotice,
      level,
      passoutYear,
      field,
      incompleteProfile,
      shortCuts,
    } = user;

    return res.status(StatusCodes.OK).json({
      course,
      role,
      interests,
      clubs: clubs.length,
      communitiesCreated: communitiesCreated.length,
      communitiesPartOf: communitiesPartOf.length,
      giftsSend: giftsSend.length,
      name,
      image,
      chatRooms,
      email,
      notices: unreadNotice.length,
      level,
      passoutYear,
      field,
      incompleteProfile,
      shortCuts,
    });
  } catch (err) {
    console.error(err);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Server error' });
  }
};

//controller 3
const updateUser = async (req, res) => {
  if (req.user.role === 'user') {
    const userID = req.user.id;
    const updatedUser = await User.findByIdAndUpdate(
      { _id: userID },
      req.body,
      { new: true, runValidators: true }
    );
    res.status(StatusCodes.OK).send('Updated successfully!');
  } else {
    return res
      .status(StatusCodes.OK)
      .send('You are not authorized to update user profile.');
  }
};

const getUser = async (req, res) => {
  if (req.user.role === 'user') {
    const { name, reg } = req.query;
    const queryObject = {};
    if (name) {
      queryObject.name = { $regex: name, $options: 'i' };
    }
    if (reg) {
      queryObject.reg = Number(reg);
    }
    let result = User.find(queryObject);
    fieldsList = 'name reg image';
    result = result.select(fieldsList);
    const finalResult = await result;
    if (!finalResult) {
      return res
        .status(StatusCodes.NO_CONTENT)
        .send('No body can match your profile even wildly.');
    }
    res.status(StatusCodes.OK).json({ finalResult });
  } else {
    return res
      .status(StatusCodes.MISDIRECTED_REQUEST)
      .send('You are not authorized to read other user profile');
  }
};

const deleteUser = async (req, res) => {
  if (req.user.role === 'user') {
    const userID = req.user.id;
    const user = await User.findOne({ _id: userID });
    if (!user) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .send('User to be deleted is no more available.');
    }
    const deletedUser = await User.findByIdAndDelete({ _id: userID });
    res.status(StatusCodes.OK).json({ deletedUser });
  } else {
    return res
      .status(StatusCodes.MISDIRECTED_REQUEST)
      .send('You are not authorized to delete user profile.');
  }
};

//psuedo controller to get an user just by sending his token in the header of the req

const getUserByToken = async (req, res) => {
  if (req.user.role === 'user') {
    const userID = req.user.id;
    User.findById(userID, (err, user) => {
      if (err) return console.error(err);
      return res.status(StatusCodes.OK).json(user);
    });
  }
};

//Master controller to perform advance search
const advanceSearch = async (req, res) => {
  const { filter, query } = req.query;
  let user = [];
  if (filter === 'name') {
    user = await User.find(
      { name: new RegExp(query, 'i', 'g') },
      {
        name: 1,
        image: 1,
        _id: 1,
        course: 1,
        pushToken: 1,
        interests: 1,
        deactivated: 1,
        email: 1,
      }
    );
  } else if (filter === 'reg') {
    user = await User.find(
      { reg: query },
      {
        name: 1,
        image: 1,
        _id: 1,
        course: 1,
        pushToken: 1,
        interests: 1,
        deactivated: 1,
        email: 1,
      }
    );
  } else if (filter === 'course') {
    user = await User.find(
      { course: new RegExp(query, 'i', 'g') },
      {
        name: 1,
        image: 1,
        _id: 1,
        course: 1,
        pushToken: 1,
        interests: 1,
        deactivated: 1,
        email: 1,
      }
    );
  } else if (filter === 'multipleClubs') {
    const decodedClubIds = JSON.parse(Buffer.from(query, 'base64').toString());
    const clubs = await Club.find(
      { _id: { $in: decodedClubIds } },
      { members: 1 }
    );
    for (let i = 0; i < clubs.length; i++) {
      const clubMembersIds = clubs[i].members;
      const clubMembers = await User.find(
        { _id: { $in: clubMembersIds } },
        {
          name: 1,
          image: 1,
          _id: 1,
          course: 1,
          pushToken: 1,
          interests: 1,
          deactivated: 1,
          email: 1,
        }
      );
      user = [...clubMembers, ...user];
    }
    console.log('len', user.length);
  } else if (filter === 'organisation') {
    const { organisationType, organisationId } = req.query;
    if (organisationType === 'Club') {
      const club = await Club.findById(organisationId, { members: 1 });
      user = await User.find(
        { _id: { $in: club.members }, name: new RegExp(query, 'i', 'g') },
        {
          name: 1,
          image: 1,
          _id: 1,
          course: 1,
          pushToken: 1,
          interests: 1,
          deactivated: 1,
          email: 1,
        }
      );
    } else if (organisationType === 'Community') {
      const community = await Community.findById(organisationId, {
        members: 1,
      });
      user = await User.find(
        { _id: { $in: community.members }, name: new RegExp(query, 'i', 'g') },
        {
          name: 1,
          image: 1,
          _id: 1,
          course: 1,
          pushToken: 1,
          interests: 1,
          deactivated: 1,
          email: 1,
        }
      );
    }
  } else if (filter === 'all') {
    const aggregate = {
      $or: [
        { name: new RegExp(query, 'i', 'g') },
        { course: new RegExp(query, 'i', 'g') },
        { interests: { $in: [new RegExp(query, 'i', 'g')] } },
      ],
    };
    user = await User.find(aggregate, {
      name: 1,
      image: 1,
      _id: 1,
      course: 1,
      pushToken: 1,
      interests: 1,
      deactivated: 1,
      email: 1,
    });
  }
  return res.status(StatusCodes.OK).json(user);
};

//demo controller made to get all user for chat app
const getAllUsers = async (req, res) => {
  const users = await User.find(
    {},
    {
      name: 1,
      image: 1,
      _id: 1,
      pushToken: 1,
      course: 1,
      interests: 1,
      email: 1,
    }
  );
  return res.status(StatusCodes.OK).json(users);
};

//Controller to get 10 random users
const randomUsers = async (req, res) => {
  let users = await User.aggregate([
    { $sample: { size: 10 } },
    {
      $project: {
        name: 1,
        image: 1,
        course: 1,
        _id: 1,
        interests: 1,
        pushToken: 1,
      },
    },
  ]);
  return res.status(StatusCodes.OK).json(users);
};

//function to change password from your profile using oldPass as authentication
const changePassword = async (req, res) => {
  const { oldPass, newPass } = req.body;
  let user = await User.findById(req.user.id, { password: 1 });
  const isOldPassCorrect = await bcrypt.compare(oldPass, user.password);
  if (isOldPassCorrect) {
    const newPassword = await securePassword(newPass);
    user.password = newPassword;
    user.save();
    return res.status(StatusCodes.OK).send('Password changed successfully');
  } else {
    return res.status(StatusCodes.OK).send('Old password does not match');
  }
};

const deactivateAccount = async (req, res) => {
  const { password } = req.body;
  try {
    let user = await User.findById(req.user.id, {
      password: 1,
      deactivated: 1,
      deactivationDate: 1,
      pushToken: 1,
    });
    const isPassCorrect = await bcrypt.compare(password, user.password);
    if (!isPassCorrect) {
      return res.status(StatusCodes.OK).send('Password is not correct.');
    }
    user.pushToken = null;
    user.deactivated = true;
    user.deactivationDate = new Date();
    user.save();
    return res.status(StatusCodes.OK).send('Deactivation successful.');
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).json('Something went wrong.');
  }
};

const pushPermanentNotice = async (req, res) => {
  const { userId } = req.query;
  const { value, img1, img2, action, params, key } = req.body;
  if (!userId || !value || !img1 || !img2 || !action || !params || !key) {
    return res
      .status(StatusCodes.OK)
      .send('Incomplete information to push a notice.');
  }
  //we have integrated in-app notice likeContent controller ,this call will be inactivated in next version, till then just a precautionary measure
  if (key !== 'like') {
    let data = {
      ...req.body,
      time: new Date(),
      uid: `${new Date()}/${userId}/${req.user.id}`,
    };
    let user = await User.findById(userId);
    user.unreadNotice = [...user.unreadNotice, data];
    user.save();
  }
  return res.status(StatusCodes.OK).send('Notice sucessfully pushed.');
};

const getPermanentNotices = async (req, res) => {
  try {
    let user = await User.findById(req.user.id, {
      unreadNotice: 1,
      notifications: 1,
    });
    const data = {
      unread: user.unreadNotice,
      read: user.notifications.slice(0, 12 - user.unreadNotice.length),
    };
    user.unreadNotice = [];
    user.notifications = [...data.unread, ...user.notifications];
    user.save();
    return res.status(StatusCodes.OK).json(data);
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).json('Something went wrong.');
  }
};

const getPermanentNoticeInBatch = async (req, res) => {
  const { batch, batchSize } = req.query;
  try {
    const user = await User.findById(req.user.id, {
      notifications: 1,
    });
    let notices = [];
    if (batch && batchSize) {
      notices = user.notifications.slice(
        (batch - 1) * batchSize,
        batch * batchSize
      );
    } else {
      notices = user.notifications;
    }
    return res.status(StatusCodes.OK).json(notices);
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).json('Something went wrong.');
  }
};

const deleteNotifications = async (req, res) => {
  try {
    const { uid } = req.body;
    let user = await User.findById(req.user.id, {
      notifications: 1,
    });
    let arr = user.notifications;
    arr = arr.filter((item) => item.uid !== uid);
    user.notifications = arr;
    user.save();
    return res
      .status(StatusCodes.OK)
      .send('Successfully deleted the notification.');
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).json('Something went wrong.');
  }
};

const getCommunitiesForPost = async (req, res) => {
  try {
    const user = await User.findById(req.user.id, {
      communitiesPartOf: 1,
      _id: 0,
    });
    const allCommunities = user.communitiesPartOf;
    const len = allCommunities.length;
    let finalData = [];
    for (let i = 0; i < len; i++) {
      const id = allCommunities[i].communityId;
      if (id) {
        const community = await Community.findById(id, {
          secondaryCover: 1,
          title: 1,
        });
        if (community) {
          finalData.push(community);
        }
      }
    }
    return res.status(StatusCodes.OK).json(finalData);
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).json('Something went wrong.');
  }
};

const sendMailToUsers = async (req, res) => {
  const { destination, intro, outro, subject } = req.body;
  try {
    const name = 'there!';
    const { ses, params } = await sendMail(
      name,
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
        return res.status(StatusCodes.OK).send('Email sent successfully.');
      }
    });
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).send('Something went wrong.');
  }
};

const getBasicUserBio = async (req, res) => {
  try {
    const { id } = req.query;
    const user = await User.findById(id, {
      course: 1,
      passoutYear: 1,
      clubs: 1,
      role: 1,
      deactivated: 1,
      communitiesPartOf: 1,
      tunedIn_By: 1,
      macbeaseContentContribution: 1,
      creatorPost: 1,
      profession: 1,
      interests: 1,
      field: 1,
      incompleteProfile: 1,
      level: 1,
    }).lean();
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).send('User not found');
    }
    const communityIds = user.communitiesPartOf.map((item) =>
      mongoose.Types.ObjectId(item.communityId)
    );
    const clubIds = user.clubs.map((item) =>
      mongoose.Types.ObjectId(item.clubId)
    );
    let tunerIds = [];
    if (user.tunedIn_By) {
      tunerIds = user.tunedIn_By.slice(0, 3);
    } else {
      tunerIds = [];
    }
    const [communities, clubs, tunerGraphics] = await Promise.all([
      Community.find(
        { _id: { $in: communityIds } },
        { title: 1, secondaryCover: 1 }
      ).lean(),
      Club.find({ _id: { $in: clubIds } }, { name: 1, secondaryImg: 1 }).lean(),
      User.find(
        { _id: { $in: tunerIds } },
        { name: 1, image: 1, pushToken: 1 }
      ).lean(),
    ]);
    const outcome = {
      course: user.course,
      tuned: user.tunedIn_By
        ? user.tunedIn_By.some((id) => id.toString() === req.user.id.toString())
        : false,
      batch: user.passoutYear,
      role: user.role,
      creatorPost: user.creatorPost,
      posts: user.macbeaseContentContribution.length,
      tunedIn_By: user.tunedIn_By ? user.tunedIn_By.length : 0,
      tunerGraphics,
      organisationData: [...clubs, ...communities],
      deactivated: user.deactivated,
      clubs: user.clubs,
      profession: user.profession,
      interests: user.interests,
      field: user.field,
      incompleteProfile: user.incompleteProfile,
      level: user.level,
    };
    return res.status(StatusCodes.OK).json(outcome);
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send('Something went wrong.');
  }
};

// function to get Push tokens
const getPushTokens = async (query, exempt) => {
  if (query === 'all-users') {
    const users = await User.find({}, { pushToken: 1 }).lean();
    return users.map((user) => user.pushToken).filter(Boolean);
  } else {
    const arr = query.split('-');
    const id = arr[0];
    const designation = arr[1];
    const type = arr[2];

    let members = [];
    if (type === 'club') {
      const club = await Club.findById(id, {
        members: 1,
        adminId: 1,
        team: 1,
      }).lean();
      if (designation === 'All Members') {
        members.push(...club.members);
      } else if (designation === 'Admins') {
        members.push(...club.adminId);
      } else {
        members.push(...club.team.map((item) => item.id));
      }
      if (exempt) {
        members = members.filter((item) => item !== exempt);
      }
    } else if (type === 'community') {
      const community = await Community.findById(id, { members: 1 });
      members.push(...community.members);
    }

    const users = await User.find(
      { _id: { $in: members } },
      { pushToken: 1 }
    ).lean();

    const pushTokens = users.map((user) => user.pushToken).filter(Boolean);

    return pushTokens;
  }
};

const sendNotification = async (req, res) => {
  let { token, title, body, query, imageUrl, url } = req.body;
  if (query !== undefined) {
    token = await getPushTokens(query);
  }
  try {
    scheduleNotification(token, title, body, imageUrl, url);
    return res.status(StatusCodes.OK).send('Notification dispatched');
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).send('Something went wrong.');
  }
};

// testing crone jobs
const cleanUp = async (req, res) => {
  try {
    const users = await User.find({}, { _id: 1 });
    const arr = users.map((item) => item._id);
    return res.status(StatusCodes.OK).json(arr);
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).send('Something went wrong.');
  }
};

// controller to get club ,community or person by name
const search = async (req, res) => {
  const { query } = req.query;
  if (!query) {
    return res.status(StatusCodes.BAD_REQUEST).send('Empty query received.');
  }
  try {
    const communities = await Community.find(
      { title: new RegExp(query, 'i', 'g') },
      {
        secondaryCover: 1,
        title: 1,
        _id: 1,
      }
    ).lean();
    const communitiesWithType = communities.map((community) => ({
      ...community,
      type: 'community',
    }));
    const clubs = await Club.find(
      { name: new RegExp(query, 'i', 'g') },
      {
        secondaryImg: 1,
        name: 1,
        _id: 1,
      }
    ).lean();
    const clubsWithType = clubs.map((club) => ({
      ...club,
      type: 'club',
    }));
    const users = await User.find(
      { name: new RegExp(query, 'i', 'g') },
      { image: 1, name: 1, _id: 1, course: 1, pushToken: 1 }
    ).lean();
    const usersWithType = users.map((user) => ({
      ...user,
      type: 'people',
    }));
    return res.status(StatusCodes.OK).json({
      clubs: clubsWithType,
      communities: communitiesWithType,
      users: usersWithType,
    });
  } catch (e) {
    console.log('Error in searching :', e);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send('Something went wrong!');
  }
};

//controller to return user bio from an array of ids
const fetchMultipleProfiles = async (req, res) => {
  try {
    const { ids } = req.body;
    const processedIds = ids.map((item) => mongoose.Types.ObjectId(item));
    const users = await User.aggregate([
      {
        $match: { _id: { $in: processedIds } },
      },
      {
        $project: {
          name: 1,
          image: 1,
          course: 1,
          _id: 1,
          interests: 1,
          pushToken: 1,
        },
      },
    ]);
    return res.status(StatusCodes.OK).json(users);
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send('Something went wrong.');
  }
};

const tuneIn = async (req, res) => {
  const { creatorId } = req.query;
  const tunerId = req.user.id;
  try {
    const [creator, tuner] = await Promise.all([
      User.findById(creatorId, { role: 1, pushToken: 1 }),
      User.findById(tunerId, { name: 1, pushToken: 1, image: 1 }),
    ]);
    if (!creator || creator.role !== 'Creator') {
      return res
        .status(StatusCodes.MISDIRECTED_REQUEST)
        .send('Content creator access not found.');
    }
    await Promise.all([
      User.findByIdAndUpdate(creatorId, {
        $addToSet: { tunedIn_By: mongoose.Types.ObjectId(tunerId) },
      }),
      User.findByIdAndUpdate(tunerId, {
        $addToSet: { hasTunedTo: mongoose.Types.ObjectId(creatorId) },
      }),
    ]);
    scheduleNotification2({
      pushToken: [creator.pushToken],
      title: `${tuner.name} Just Tuned In! 🎉`,
      body: `Your content is gaining fans! ${tuner.name} is now following your journey.`,
      url: `https://macbease-website.vercel.app/app/profile/${tuner._id}/${tuner.name}/${tuner.pushToken}/${tuner.image}`,
    });
    return res.status(StatusCodes.OK).send('Successfully tuned in!');
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send('Error occurred while tuning in.');
  }
};

const untune = async (req, res) => {
  const { creatorId } = req.query;
  const tunerId = req.user.id;
  try {
    const creator = await User.findById(creatorId, { role: 1 });
    if (!creator || creator.role !== 'Creator') {
      return res
        .status(StatusCodes.MISDIRECTED_REQUEST)
        .send('Content creator access not found.');
    }
    await Promise.all([
      User.findByIdAndUpdate(creatorId, {
        $pull: { tunedIn_By: mongoose.Types.ObjectId(tunerId) },
      }),
      User.findByIdAndUpdate(tunerId, {
        $pull: { hasTunedTo: mongoose.Types.ObjectId(creatorId) },
      }),
    ]);
    return res.status(StatusCodes.OK).send('Successfully untuned!');
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send('Error occurred while untuning.');
  }
};

const getProfessorRecommendations = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 6;
    const professors = await User.aggregate([
      { $match: { profession: 'Professor' } },
      {
        $project: {
          name: 1,
          image: 1,
          pushToken: 1,
          course: 1,
          field: 1,
        },
      },
      { $limit: limit },
    ]);
    return res.status(200).json(professors);
  } catch (error) {
    console.error('Error finding professor recommendations:', error.message);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send('Error finding professor recommendations');
  }
};

const searchFromAllProfessors = async (req, res) => {
  try {
    const { query } = req.query;
    if (!query || typeof query !== 'string') {
      return res
        .status(400)
        .send('Query parameter is required and must be a string');
    }
    const regex = new RegExp(query, 'i');
    const professors = await User.aggregate([
      { $match: { profession: 'Professor' } },
      {
        $match: {
          $or: [{ course: { $regex: regex } }, { field: { $regex: regex } }],
        },
      },
      {
        $project: {
          name: 1,
          image: 1,
          pushToken: 1,
          course: 1,
          field: 1,
        },
      },
    ]);
    return res.status(200).json(professors);
  } catch (error) {
    console.error('Error searching professors:', error.message);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send('Error searching professors');
  }
};

module.exports = {
  getUser,
  updateUser,
  deleteUser,
  getUserByToken,
  searchUserByName,
  getUserBio,
  advanceSearch,
  getAllUsers,
  cleanUp,
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
  search,
  fetchMultipleProfiles,
  getPushTokens,
  tuneIn,
  untune,
  getProfessorRecommendations,
  searchFromAllProfessors,
};
