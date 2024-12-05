const { StatusCodes } = require('http-status-codes');
const Club = require('../models/club');
const Event = require('../models/event');
const User = require('../models/user');
const Admin = require('../models/admin');
const Content = require('../models/content');
const Community = require('../models/community');
const MacbeaseContent = require('../models/macbeaseContent');
const Invitation = require('../models/invitation');
const schedule = require('node-schedule');
const {
  sendMail,
  getCurrentISTDate,
  scheduleNotification,
  updateDynamicIsland,
  scheduleNotification2,
  generateUri,
} = require('../controllers/utils');
const { formatDateToMonthDay } = require('./commonControllers');
const mongoose = require('mongoose');
const { getPushTokens } = require('./userControllers');

//Middleware

const checkAuthorization = async (clubId, id) => {
  const club = await Club.findById(clubId, {
    adminId: 1,
    mainAdmin: 1,
    _id: 0,
  });
  if (club) {
    if (club.mainAdmin === id) return 'Fully-authorized';
    let admins = club.adminId;
    let matchedAdmin = admins.find((item) => item === id);
    if (matchedAdmin) return 'Authorized';
    return 'Not-authorized';
  } else {
    return 'Club not found';
  }
};

const isInTeam = async (clubId, id) => {
  const club = await Club.findById(clubId, { team: 1, _id: 0 });
  for (let i = 0; i < club.team.length; i++) {
    const memberId = club.team[i].id;
    if (memberId === id) {
      return 'Team Member';
    }
  }
  return 'Not Team Member';
};

const checkIsMember = async (clubId, userId) => {
  const club = await Club.findById(clubId);
  if (club) {
    let clubMembers = club.members;
    let matchedMember = clubMembers.find((item) => item === userId);
    if (matchedMember) return 'Is a member';
    return 'Not a member';
  } else {
    return 'Club not found';
  }
};

//Controller 1

const validateRequestBody = (body) => {
  const errors = [];

  // Required fields and their validation logic
  if (!body.name || typeof body.name !== 'string' || body.name.trim() === '') {
    errors.push('Name is required and must be a non-empty string.');
  }

  if (
    !body.motto ||
    typeof body.motto !== 'string' ||
    body.motto.trim() === ''
  ) {
    errors.push('Motto is required and must be a non-empty string.');
  }

  if (
    !body.featuringImg ||
    typeof body.featuringImg !== 'string' ||
    body.featuringImg.trim() === ''
  ) {
    errors.push('Featuring image must be a valid URL.');
  }

  if (
    !body.chiefImage ||
    typeof body.chiefImage !== 'string' ||
    body.chiefImage.trim() === ''
  ) {
    errors.push('Chief image must be a valid URL.');
  }

  if (
    !body.chiefMsg ||
    typeof body.chiefMsg !== 'string' ||
    body.chiefMsg.trim() === ''
  ) {
    errors.push('Chief message is required and must be a non-empty string.');
  }

  if (
    !Array.isArray(body.tags) ||
    body.tags.length === 0 ||
    body.tags.some((tag) => typeof tag !== 'string' || tag.trim() === '')
  ) {
    errors.push('Tags must be a non-empty array of non-empty strings.');
  }

  if (
    !body.secondaryImg ||
    typeof body.secondaryImg !== 'string' ||
    body.secondaryImg.trim() === ''
  ) {
    errors.push('Secondary image must be a valid URL.');
  }

  return errors;
};

const createClub = async (req, res) => {
  try {
    const errors = validateRequestBody(req.body);
    if (errors.length > 0) {
      return res.status(StatusCodes.BAD_REQUEST).json({ errors });
    }
    const club = await Club.create({
      ...req.body,
      adminId: [req.user.id],
      mainAdmin: req.user.id,
      team: [{ id: req.user.id, pos: 'Founder' }],
      members: [req.user.id],
      createdOn: new Date(),
    });
    const founder = await User.findById(req.user.id, {
      clubs: 1,
      unreadNotice: 1,
      email: 1,
      name: 1,
      pushToken: 1,
      image: 1,
      reg: 1,
      shortCuts: 1,
    });
    founder.clubs.push({
      clubId: club._id.toString(),
      joinDate: new Date(),
      badges: [],
    });
    await founder.save();
    secondaryActionsForClubCreation(req, club, founder);
    return res.status(StatusCodes.OK).json(club);
  } catch (error) {
    console.error(error);
    return res.status(StatusCodes.OK).send('Something went wrong.');
  }
};

const secondaryActionsForClubCreation = async (req, club, founder) => {
  try {
    //sending an in-app notification
    const scheduleTime = new Date(Date.now() + 3000);
    schedule.scheduleJob(`clubCreation_${club._id}`, scheduleTime, async () => {
      const noticeForFounder = {
        value: `Congratulations! ${founder.name} for starting the club ${club.name}.`,
        img1: club.secondaryImg,
        img2: founder.image,
        key: 'read',
        action: 'club',
        params: {
          name: club.name,
          secondaryImg: club.secondaryImg,
          id: club._id,
        },
        time: new Date(),
        uid: `${new Date()}/${club.mainAdmin}/${req.user.id}`,
      };
      const shortCut = {
        type: 'club',
        id: club._id,
        name: club.name,
        secondaryImg: club.secondaryImg,
        native: true,
        metaData: { posts: 0, notifications: 0, messages: 0 },
      };
      founder.shortCuts = [shortCut, ...founder.shortCuts];
      founder.unreadNotice = [noticeForFounder, ...founder.unreadNotice];
      await founder.save();
      scheduleNotification2({
        pushToken: [founder.pushToken],
        title: `🎉 Hats Off, Founder Extraordinaire! 🎩`,
        body: `You've just birthed the legendary club "${club.name}" into existence. The world (and your members) are waiting for your brilliance! 🌟`,
        url: `https://macbease-website.vercel.app/app/club/${club._id}/${club.name}/${club.secondaryImg}`,
      });

      //sending an email
      const name = founder.name;
      const intro = [
        `Congratulations! ${founder.name} for starting the club ${club.name}.`,
        'Our team at Macbease will help you turn this club into great organization.',
      ];
      const outro =
        'This email contains privileged and confidential information intended solely for the use of the individual or entity named. If you are not the intended recipient, please notify the sender immediately and delete this message from your system. Unauthorized use, dissemination, or copying is strictly prohibited.';
      const subject = 'Club Creation';
      const destination = [founder.email];
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
        }
      });
    });
  } catch (error) {
    console.error('Error in secondary action for club creation:', error);
  }
};

//Controller 2
const deleteClub = async (req, res) => {
  if (req.user.role === 'admin' || req.user.role === 'user') {
    const { clubId } = req.body;
    const id = req.user.id;
    const isAuthorized = await checkAuthorization(clubId, id);
    if (isAuthorized === 'Fully-authorized') {
      if (req.user.role === 'admin') {
        const deletedClub = await Club.findByIdAndRemove({ _id: clubId });
        Admin.findById(req.user.id, (err, admin) => {
          if (err) return console.error(err);
          let clubs = admin.clubs;
          clubs.filter((item) => {
            item !== clubId;
          });
          admin.clubs = [];
          admin.clubs = clubs;
          admin.save((err, update) => {
            if (err) return console.error(err);
            return res
              .status(StatusCodes.OK)
              .send('Club was successfully deleted.');
          });
        });
      }
      if (req.user.role === 'user') {
        const deletedClub = await Club.findByIdAndRemove({ _id: clubId });
        User.findById(req.user.id, (err, user) => {
          if (err) return console.error(err);
          let clubs = user.clubs;
          clubs = clubs.filter((item) => {
            item.clubId !== clubId;
          });
          user.clubs = [];
          user.clubs = clubs;
          user.save((err, update) => {
            if (err) return console.error(err);
            return res
              .status(StatusCodes.OK)
              .send('Club was successfully deleted.');
          });
        });
      }
    }
    if (isAuthorized === 'Authorized' || isAuthorized === 'Not-authorized') {
      return res
        .status(StatusCodes.OK)
        .send('You are not authorized to delete the club.');
    }
    if (isAuthorized === 'Club not found') {
      return res.status(StatusCodes.OK).send('No such club is active.');
    }
  } else {
    return res
      .status(StatusCodes.OK)
      .send('You are not authorized to access the route of deleting the club.');
  }
};

//Controller 3
const joinAsMember = async (req, res) => {
  if (req.user.role === 'admin' || req.user.role === 'user') {
    const { clubId } = req.body;
    Club.findById(clubId, (err, club) => {
      if (err) return console.error(err);
      if (club.members.includes(req.user.id)) {
        return res.status(StatusCodes.OK).send('You are already a member.');
      }
      if (club) {
        if (req.user.role === 'user') {
          User.findById(req.user.id, (err, user) => {
            if (err) return console.error(err);
            user.clubs.push({
              clubId: clubId,
              joinDate: new Date(),
              badges: [],
            });
            user.save();
          });
        }
        if (req.user.role === 'admin') {
          Admin.findById(req.user.id, (err, admin) => {
            if (err) return console.error(err);
            admin.clubs.push({ clubId: clubId });
            admin.save();
          });
        }
        club.members.push(req.user.id);
        let len = club.xAxisData.length;
        let lastElement = club.xAxisData[len - 1];
        let newElement = lastElement + 1;
        club.xAxisData.push(newElement);
        club.yAxisData.push(new Date());
        club.save((err, update) => {
          if (err) return console.error(err);
          return res
            .status(StatusCodes.OK)
            .send('You have successfully joined as the member of the club.');
        });
      } else {
        return res.status(StatusCodes.OK).send('No such club found.');
      }
    });
  } else {
    return res
      .status(StatusCodes.OK)
      .send('You are not authorized to be the member of the club.');
  }
};

//Controller 4
const leaveAsMember = async (req, res) => {
  if (req.user.role === 'admin' || req.user.role === 'user') {
    const { clubId } = req.body;
    Club.findById(clubId, (err, club) => {
      if (err) return console.error(err);
      if (club) {
        if (req.user.role === 'user') {
          if (req.user.id === club.mainAdmin)
            return res
              .status(StatusCodes.OK)
              .send(
                'You are the founder.You leaving means club going down.Contact Macbease.'
              );
          User.findById(req.user.id, (err, user) => {
            if (err) return console.error(err);
            let clubs = user.clubs;
            let len = clubs.length;
            let data = [];
            for (let i = 0; i < len; i++) {
              let id = clubs[i].clubId;
              if (id !== clubId) {
                data.push(clubs[i]);
              }
            }
            user.clubs = [];
            user.clubs = data;
            user.save();
          });
        }
        if (req.user.role === 'admin') {
          Admin.findById(req.user.id, (err, admin) => {
            if (err) return console.error(err);
            let clubs = admin.clubs;
            clubs = clubs.filter((item) => {
              item !== clubId;
            });
            admin.clubs = [];
            admin.clubs = clubs;
            admin.save();
          });
        }
        let clubMembers = club.members;
        clubMembers = clubMembers.filter((item) => item !== req.user.id);
        club.members = [];
        club.members = clubMembers;
        let clubAdmins = club.adminId;
        clubAdmins = clubAdmins.filter((item) => item !== req.user.id);
        club.adminId = [];
        club.adminId = clubAdmins;
        let clubTeam = club.team;
        clubTeam = clubTeam.filter((item) => item.id !== req.user.id);
        club.team = [];
        club.team = clubTeam;
        let len = club.xAxisData.length;
        let lastElement = club.xAxisData[len - 1];
        let newElement = lastElement - 1;
        club.xAxisData.push(newElement);
        club.yAxisData.push(new Date());
        club.save((err, update) => {
          if (err) return console.error(err);
          return res
            .status(StatusCodes.OK)
            .send('You have successfully leaved as the member of the club.');
        });
      } else {
        return res.status(StatusCodes.OK).send('No such club found.');
      }
    });
  } else {
    return res
      .status(StatusCodes.OK)
      .send(
        'You are not authorized to access the route of leaving as member of the club.'
      );
  }
};

//Controller 5
const addAsMember = async (req, res) => {
  try {
    const { role, id } = req.user;
    if (role !== 'admin' && role !== 'user') {
      return res
        .status(StatusCodes.FORBIDDEN)
        .send('You are not authorized to add members to the club.');
    }
    const { clubId, userId } = req.body;
    const isAuthorized = await checkAuthorization(clubId, id);
    if (isAuthorized === 'Not-authorized') {
      return res
        .status(StatusCodes.FORBIDDEN)
        .send('You are not authorized to add members to the club.');
    }
    if (isAuthorized === 'Club not found') {
      return res.status(StatusCodes.NOT_FOUND).send('No such club is active.');
    }
    const [club, user] = await Promise.all([
      Club.findById(clubId, {
        name: 1,
        secondaryImg: 1,
        members: 1,
        xAxisData: 1,
        yAxisData: 1,
      }),
      User.findById(userId, {
        name: 1,
        email: 1,
        clubs: 1,
        image: 1,
        unreadNotice: 1,
        pushToken: 1,
      }),
    ]);
    if (!club) {
      return res.status(StatusCodes.NOT_FOUND).send('No such club found.');
    }
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).send('No such user found.');
    }
    user.clubs.push({
      clubId,
      joinDate: new Date(),
      badges: [],
    });
    await user.save();
    club.members.push(userId);
    const newElement =
      (club.xAxisData.length ? club.xAxisData[club.xAxisData.length - 1] : 0) +
      1;
    club.xAxisData.push(newElement);
    club.yAxisData.push(new Date());
    await club.save();
    scheduleMemberNotification(user, club);
    return res
      .status(StatusCodes.OK)
      .send('Successfully added the member of the club.');
  } catch (err) {
    console.error(err);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send('An error occurred while adding the member.');
  }
};

const scheduleMemberNotification = (user, club) => {
  const notice = {
    value: `Congratulations! ${club.name} accepted your membership application.`,
    img1: club.secondaryImg,
    img2: user.image,
    key: 'read',
    action: 'club',
    params: { name: club.name, secondaryImg: club.secondaryImg, id: club._id },
    time: new Date(),
    uid: new Date().toISOString() + 'membership_accepted',
  };
  const scheduleTime = new Date(Date.now() + 3 * 1000);
  schedule.scheduleJob(
    `congratulateMember_${user.id}_${scheduleTime}`,
    scheduleTime,
    async () => {
      user.unreadNotice.unshift(notice);
      scheduleNotification2({
        pushToken: [user.pushToken],
        title: `Congratulations🎊🥳🎉!`,
        body: `${club.name} accepted your membership application.`,
        url: `https://macbease-website.vercel.app/app/club/${club._id}/${club.name}/${club.secondaryImg}`,
      });
      await user.save();
      await sendMemberEmail(user, club);
    }
  );
};

// Function to send member email
const sendMemberEmail = async (user, club) => {
  const name = user.name;
  const intro = [
    `Congratulations! for becoming the member of the club ${club.name}.`,
    'As a member, you will have access to exclusive events, resources, and opportunities to connect with fellow members. We encourage you to participate actively and make the most of your membership.',
  ];
  const outro =
    'This email contains privileged and confidential information intended solely for the use of the individual or entity named. If you are not the intended recipient, please notify the sender immediately and delete this message from your system. Unauthorized use, dissemination, or copying is strictly prohibited.';
  const subject = 'Great News';
  const destination = [user.email];

  const { ses, params } = await sendMail(
    name,
    intro,
    outro,
    subject,
    destination
  );
  ses.sendEmail(params, (err) => {
    if (err) {
      console.error('Error sending email:', err);
    }
  });
};

//Controller 6
const removeAsMember = async (req, res) => {
  if (req.user.role === 'admin' || req.user.role === 'user') {
    const { clubId, userId } = req.body;
    const id = req.user.id;
    const isAuthorized = await checkAuthorization(clubId, id);
    if (isAuthorized === 'Fully-authorized') {
      Club.findById(clubId, (err, club) => {
        if (err) return console.error(err);
        User.findById(userId, (err, user) => {
          if (err) return console.error(err);
          let clubs = user.clubs;
          clubs = clubs.filter((item) => {
            item !== clubId;
          });
          user.clubs = [];
          user.clubs = clubs;
          user.save();
        });
        let clubMembers = club.members;
        let clubAdmins = club.adminId;
        let clubTeam = club.team;
        clubMembers = clubMembers.filter((item) => item !== userId);
        clubAdmins = clubAdmins.filter((item) => item !== userId);
        let teamArr = [];
        for (let i = 0; i < clubTeam.length; i++) {
          if (clubTeam[i].id !== userId) {
            teamArr.push(clubTeam[i]);
          }
        }
        club.members = [];
        club.members = clubMembers;
        club.adminId = [];
        club.adminId = clubAdmins;
        club.team = [];
        club.team = teamArr;
        let len = club.xAxisData.length;
        let lastElement = club.xAxisData[len - 1];
        let newElement = lastElement - 1;
        club.xAxisData.push(newElement);
        club.yAxisData.push(new Date());
        club.save((err, update) => {
          if (err) return console.error(err);
          return res
            .status(StatusCodes.OK)
            .send('Successfully removed the member of the club.');
        });
      });
    }
    if (isAuthorized === 'Not-authorized') {
      return res
        .status(StatusCodes.OK)
        .send('You are not authorized to remove members from the club.');
    }
    if (isAuthorized === 'Club not found') {
      return res.status(StatusCodes.OK).send('No such club is active.');
    }
  } else {
    return res
      .status(StatusCodes.OK)
      .send('You are not authorized to remove members from the club.');
  }
};

//Controller 7
const addAdmin = async (req, res) => {
  try {
    const { clubId, userId } = req.body;
    const { id, role } = req.user;
    const isAuthorized = await checkAuthorization(clubId, id);
    if (isAuthorized === 'Club not found') {
      return res.status(StatusCodes.NOT_FOUND).send('No such club is active.');
    }
    if (isAuthorized !== 'Fully-authorized') {
      return res
        .status(StatusCodes.FORBIDDEN)
        .send('You are not authorized to add an admin to the club.');
    }
    const isMember = await checkIsMember(clubId, userId);
    if (isMember !== 'Is a member') {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .send('The user must first become a member of the club.');
    }
    const club = await Club.findById(clubId, {
      adminId: 1,
      name: 1,
      secondaryImg: 1,
    });
    const userInfo = await User.findById(userId, { pushToken: 1 });
    if (!club) {
      return res.status(StatusCodes.NOT_FOUND).send('Club not found.');
    }
    club.adminId.push(userId);
    scheduleNotification2({
      pushToken: [userInfo.pushToken],
      title: `Congratulations🎊🥳🎉!`,
      body: `You were promoted to admin post in ${club.name}`,
      url: `https://macbease-website.vercel.app/app/club/${clubId}/${club.name}/${club.secondaryImg}`,
    });
    await club.save();
    return res.status(StatusCodes.OK).send('Admin successfully added');
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send('An error occurred while adding the admin.');
  }
};

//Controller 8
const removeAdmin = async (req, res) => {
  if (req.user.role === 'admin' || req.user.role === 'user') {
    const { clubId, userId } = req.body;
    const id = req.user.id;
    const isAuthorized = await checkAuthorization(clubId, id);
    if (isAuthorized === 'Fully-authorized') {
      Club.findById(clubId, (err, club) => {
        if (err) return console.error(err);
        let admins = club.adminId;
        admins = admins.filter((item) => item !== userId);
        club.adminId = [];
        club.adminId = admins;
        club.save((err, update) => {
          if (err) return console.error(err);
          return res
            .status(StatusCodes.OK)
            .send('Admin has been successfully removed.');
        });
      });
    }
    if (isAuthorized === 'Authorized' || isAuthorized === 'Not-authorized') {
      return res
        .status(StatusCodes.OK)
        .send('You are not authorized to remove admin from the club.');
    }
    if (isAuthorized === 'Club not found') {
      return res.status(StatusCodes.OK).send('No such club is active.');
    }
  } else {
    return res
      .status(StatusCodes.OK)
      .send(
        'You are not authorized to access this route of removing admin from the club.'
      );
  }
};

// Function to segregate array into batches
function segregateIntoBatches(array, batchSize) {
  const batches = [];
  for (let i = 0; i < array.length; i += batchSize) {
    batches.push(array.slice(i, i + batchSize));
  }
  return batches;
}

//Controller 9
const postEvent = async (req, res) => {
  if (req.user.role === 'admin' || req.user.role === 'user') {
    let { clubId, event } = req.body;
    event = { ...event, postedBy: req.user.id };
    try {
      const isAuthorized = await checkAuthorization(clubId, req.user.id);
      if (
        isAuthorized === 'Fully-authorized' ||
        isAuthorized === 'Authorized'
      ) {
        let club = await Club.findById(clubId, { upcomingEvent: 1, name: 1 });
        club.upcomingEvent = [event, ...club.upcomingEvent];
        club.save();

        //scheduling job for pushing notification,email and feed to the members
        let threeSec = new Date(Date.now() + 1 * 3 * 1000);
        schedule.scheduleJob(
          `pushNoticeOfEvent_${req.user.id}_${new Date()}`,
          threeSec,
          async () => {
            let members = await Club.findById(clubId, { members: 1, _id: 0 });
            members = members.members;
            let len = members.length;
            let club = await Club.findById(clubId, {
              name: 1,
              secondaryImg: 1,
              _id: 0,
              notifications: 1,
            });
            const notice = {
              value: `${club.name} is going to organize ${event.name}.`,
              img1: club.secondaryImg,
              img2: event.url,
              key: 'event',
              action: 'club',
              params: {
                name: club.name,
                secondaryImg: club.secondaryImg,
                id: clubId,
              },
              time: new Date(),
              uid: ' ',
            };
            let emails = [];

            //feeding club notification
            const clubName = club.name;
            const eventName = event.name;
            const eventDate = event.eventDate;
            const clubNotice = {
              uid: new Date() + req.user.id,
              title: 'Upcoming event',
              msg: `We are going to organize ${eventName} on ${eventDate}!`,
              visibility: 'public',
              createdAt: new Date(),
            };
            club.notifications = [clubNotice, ...club.notifications];
            club.save();

            //sending in-app notice and push notification and updating event feed of all the memebers
            for (let i = 0; i < len; i++) {
              let userId = members[i];
              let user = await User.findById(userId, {
                unreadNotice: 1,
                eventFeed: 1,
                email: 1,
                pushToken: 1,
              });
              scheduleNotification(
                [user.pushToken],
                'Upcoming Event',
                `${clubName} is going to organize ${eventName} on ${eventDate}`
              );
              notice.uid = `${new Date()}/${user._id}/${req.user.id}`;
              user.unreadNotice = [notice, ...user.unreadNotice];
              user.eventFeed = [
                {
                  ...event,
                  header: `${club.name} is going to organize ${event.name}`,
                },
              ];
              emails = [user.email, ...emails];
              user.save();
            }

            //sending mail to memebers
            const emailBatchesOf50 = segregateIntoBatches(emails, 50);
            const intro = [
              `We are glad to inform you that ${club.name} is going to organize ${event.name}. Find out more on club's official page at Macbease.`,
              `We are expecting to see your active participation.`,
            ];
            const outro = 'This is good college life!';
            const subject = 'Upcoming Event';
            const name = 'there!';
            emailBatchesOf50.forEach(async function (element) {
              const destination = element;
              const { ses, params } = await sendMail(
                name,
                intro,
                outro,
                subject,
                destination
              );
              try {
                const result = await ses.sendEmail(params).promise();
              } catch (error) {
                console.error('Error sending email:', error);
              }
            });
          }
        );

        return res.status(StatusCodes.OK).send('Event posted successfully.');
      } else {
        return res
          .status(StatusCodes.OK)
          .send('You have to be admin to post an event.');
      }
    } catch (error) {
      console.log(error);
      return res.status(StatusCodes.OK).send('Something went wrong.');
    }
  } else {
    return res
      .status(StatusCodes.OK)
      .send('You are not authorized to access this route of posting an event.');
  }
};

//Controller 10
const removeEvent = async (req, res) => {
  if (req.user.role === 'admin' || req.user.role === 'user') {
    const { clubId, eventId } = req.body;
    const isAuthorized = await checkAuthorization(clubId, req.user.id);
    if (isAuthorized === 'Fully-authorized' || isAuthorized === 'Authorized') {
      Club.findById(clubId, async (err, club) => {
        let events = club.upcomingEvent;
        let filteredEvents = [];
        let cantDelete = false;
        for (let i = 0; i < events.length; i++) {
          let eventPoint = events[i];
          if (eventPoint.id === eventId && eventPoint.eventId) {
            const concernedEvent = await Event.findById(eventPoint.eventId);
            if (
              concernedEvent.status === 'featured' ||
              concernedEvent.status === 'past and unclear'
            ) {
              cantDelete = true;
              break;
            } else {
              await Event.findByIdAndDelete(eventPoint.eventId);
            }
          } else {
            filteredEvents.push(eventPoint);
          }
        }
        if (cantDelete) {
          return res.status(StatusCodes.OK).send('Cant delete featured event');
        } else {
          club.upcomingEvent = filteredEvents;
          club.save();
          return res.status(StatusCodes.OK).send('Successfully removed event!');
        }
      });
    } else {
      return res
        .status(StatusCodes.OK)
        .send('You have to be admin to remove an event.');
    }
  } else {
    return res
      .status(StatusCodes.OK)
      .send(
        'You are not authorized to access this route of removing an event.'
      );
  }
};

//Controller 11
const postContent = async (req, res) => {
  if (req.user.role === 'admin' || req.user.role === 'user') {
    let { clubId, contentId } = req.body;
    const isAuthorized = await checkAuthorization(clubId, req.user.id);
    if (isAuthorized === 'Fully-authorized' || isAuthorized === 'Authorized') {
      try {
        //scheduling job for updating feed
        let threeSec = new Date(Date.now() + 1 * 3 * 1000);
        let content = await Content.findById(contentId, {
          url: 1,
          contentType: 1,
          text: 1,
        });
        content = content._doc;
        schedule.scheduleJob(
          `feedClub_${req.user.id}_${new Date()}`,
          threeSec,
          async () => {
            try {
              //reproduce actual content to be pushed in the user's feed
              const club = await Club.findById(clubId, {
                members: 1,
                name: 1,
                secondaryImg: 1,
                pinnedBy: 1,
                _id: 0,
              });
              let point = {
                _id: contentId,
              };
              let noticeTemplate = {
                value: `${club.name} posted a pin.`,
                img1: club.secondaryImg,
                img2: content.url,
                contentType: content.contentType,
                key: 'content',
                action: 'club',
                params: {
                  name: club.name,
                  secondaryImg: club.secondaryImg,
                  id: clubId,
                },
                time: new Date(),
              };
              let users = await User.find(
                { _id: { $in: club.members } },
                { pushToken: 1, feed: 1, unreadNotice: 1 }
              );
              const tokens = users.map((item) => item.pushToken);
              let userUpdatePromise = users.map((user) => {
                let notice = {
                  ...noticeTemplate,
                  uid: `${new Date()}/${user._id}/${req.user.id}`,
                };
                user.feed = [point, ...user.feed];
                user.unreadNotice = [notice, ...user.unreadNotice];
                return user.save();
              });
              await Promise.all(userUpdatePromise);
              await updateDynamicIsland(club.pinnedBy, clubId, 'posts', true);
              if (content.contentType === 'image') {
                const img = await generateUri(content.url.split('@')[0]);
                scheduleNotification2({
                  pushToken: tokens,
                  title: `${club.name} posted a pin.`,
                  body: `${content.text.substring(0, 50)}...`,
                  image: img,
                  url: `https://macbease-website.vercel.app/app/club/${clubId}/${club.name}/${club.secondaryImg}`,
                });
              } else {
                scheduleNotification2({
                  pushToken: tokens,
                  title: `${club.name} posted a pin.`,
                  body: `${content.text.substring(0, 50)}...`,
                  url: `https://macbease-website.vercel.app/app/club/${clubId}/${club.name}/${club.secondaryImg}`,
                });
              }
            } catch (error) {
              console.error('Error in scheduled job:', error);
            }
          }
        );
        let data = { contentId, postedBy: req.user.id, timeStamp: new Date() };
        let concernedClub = await Club.findById(clubId, {
          content: 1,
          videos: 1,
        });
        concernedClub.content = [...concernedClub.content, data];
        if (content.contentType === 'video') {
          concernedClub.videos = [...concernedClub.videos, data];
        }
        concernedClub.save();
        let user = await User.findById(req.user.id, { clubContributions: 1 });
        user.clubContributions = [contentId, ...user.clubContributions];
        user.save();
        return res.status(StatusCodes.OK).send('Successfully posted content!');
      } catch (error) {
        console.log(error);
        return res.status(StatusCodes.OK).send('Something went wrong.');
      }
    } else {
      return res
        .status(StatusCodes.OK)
        .send('You have to be admin to post a content.');
    }
  } else {
    return res
      .status(StatusCodes.OK)
      .send(
        'You are not authorized to access this route of posting a content.'
      );
  }
};

//Controller 12
const removeContent = async (req, res) => {
  if (req.user.role === 'admin' || req.user.role === 'user') {
    const { clubId, contentId } = req.body;
    const isAuthorized = await checkAuthorization(clubId, req.user.id);
    if (isAuthorized === 'Fully-authorized' || isAuthorized === 'Authorized') {
      Club.findById(clubId, (err, club) => {
        if (err) return console.error(err);
        let contents = club.content;
        let videos = club.videos;
        contents = contents.filter((item) => item.contentId !== contentId);
        videos = videos.filter((item) => item.contentId !== contentId);
        club.content = [];
        club.videos = [];
        club.content = [...contents];
        club.videos = [...videos];
        club.save((err, update) => {
          if (err) return console.error(err);
          return res
            .status(StatusCodes.OK)
            .send('Successfully removed content!');
        });
      });
    } else {
      return res
        .status(StatusCodes.OK)
        .send('You have to be admin to remove a content.');
    }
  } else {
    return res
      .status(StatusCodes.OK)
      .send(
        'You are not authorized to access this route of removing a content.'
      );
  }
};

//Controller 13
const postGallery = async (req, res) => {
  if (req.user.role === 'admin' || req.user.role === 'user') {
    let { clubId, url, id, desc, date } = req.body;
    const isAuthorized = await checkAuthorization(clubId, req.user.id);
    if (isAuthorized === 'Fully-authorized' || isAuthorized === 'Authorized') {
      let data = { url, id, postedBy: req.user.id, desc, date };
      Club.findById(clubId, (err, club) => {
        if (err) return console.error(err);
        club.gallery.push(data);
        club.save((err, update) => {
          if (err) return console.error(err);
          return res
            .status(StatusCodes.OK)
            .send('Successfully posted in gallery!');
        });
      });
    } else {
      return res
        .status(StatusCodes.OK)
        .send('You have to be admin to post in gallery!');
    }
  } else {
    return res
      .status(StatusCodes.OK)
      .send(
        'You are not authorized to access this route of posting in gallery.'
      );
  }
};

//Controller 14
const removeGallery = async (req, res) => {
  if (req.user.role === 'admin' || req.user.role === 'user') {
    const { clubId, id } = req.body;
    const isAuthorized = await checkAuthorization(clubId, req.user.id);
    if (isAuthorized === 'Fully-authorized' || isAuthorized === 'Authorized') {
      Club.findById(clubId, (err, club) => {
        if (err) return console.error(err);
        let gallery = club.gallery;
        gallery = gallery.filter((item) => item.id !== id);
        club.gallery = [];
        club.gallery = [...gallery];
        club.save((err, update) => {
          if (err) return console.error(err);
          return res
            .status(StatusCodes.OK)
            .send('Successfully removed from gallery!');
        });
      });
    } else {
      res
        .status(StatusCodes.OK)
        .send('You have to be admin to remove from gallery.');
    }
  } else {
    return res
      .status(StatusCodes.OK)
      .send(
        'You are not authorized to access this route of removing from gallery.'
      );
  }
};

//Controller 15
const addNotifications = async (req, res) => {
  try {
    let { clubId, notification } = req.body;
    const user = await User.findById(req.user.id, { name: 1, image: 1 });
    notification = {
      ...notification,
      postedBy: req.user.id,
      createdAt: getCurrentISTDate(),
      name: user.name,
      image: user.image,
    };
    const isAuthorized = await checkAuthorization(clubId, req.user.id);
    if (isAuthorized === 'Fully-authorized' || isAuthorized === 'Authorized') {
      const club = await Club.findById(clubId, {
        notifications: 1,
        pinnedBy: 1,
      });
      club.notifications = [notification, ...club.notifications];
      await club.save();
      let threeSec = new Date(Date.now() + 1 * 3 * 1000);
      schedule.scheduleJob(
        `addClubNotice_${req.user.id}_${new Date()}`,
        threeSec,
        async () => {
          try {
            await updateDynamicIsland(
              club.pinnedBy,
              clubId,
              'notifications',
              true
            );
          } catch (error) {
            console.error('Error in scheduled job:', error);
          }
        }
      );
      return res
        .status(StatusCodes.OK)
        .send('Notification was successfully added.');
    } else {
      return res
        .status(StatusCodes.OK)
        .send('You have to be an admin to add notifications to the club.');
    }
  } catch (error) {
    console.log(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send('Error occured while creating notification.');
  }
};

//Controller 16
const deleteNotifications = async (req, res) => {
  if (req.user.role === 'admin' || req.user.role === 'user') {
    let { clubId, uid } = req.body;
    const isAuthorized = await checkAuthorization(clubId, req.user.id);
    if (isAuthorized === 'Fully-authorized' || isAuthorized === 'Authorized') {
      Club.findById(clubId, (err, club) => {
        if (err) return console.error(err);
        let notifications = club.notifications;
        notifications = notifications.filter((item) => item.uid !== uid);
        club.notifications = [];
        club.notifications = [...notifications];
        club.save((err, update) => {
          if (err) return console.error(err);
          return res
            .status(StatusCodes.OK)
            .send('Notification has been successfully deleted.');
        });
      });
    } else {
      res
        .status(StatusCodes.OK)
        .send('You have to be admin to delete notification.');
    }
  } else {
    return res
      .status(StatusCodes.OK)
      .send('You are not authorized to delete notifications from the club.');
  }
};

//Controller 17
const editProfile = async (req, res) => {
  if (req.user.role === 'user' || req.user.role === 'admin') {
    const { clubId, data } = req.body;
    const isAuthorized = await checkAuthorization(clubId, req.user.id);
    if (isAuthorized === 'Fully-authorized') {
      const club = await Club.findByIdAndUpdate(clubId, { ...data });
      return res.status(StatusCodes.OK).send('Successfully updated!');
    } else {
      return res
        .status(StatusCodes.OK)
        .send('You have to be main admin to edit the profile.');
    }
  } else {
    return res
      .status(StatusCodes.OK)
      .send(
        "You are not authorized to access this route of editing club's profile."
      );
  }
};

//Controller 18
const addTeamMember = async (req, res) => {
  try {
    const { clubId, id, pos } = req.body;
    const data = { id, pos };
    const isAuthorized = await checkAuthorization(clubId, req.user.id);
    const authorization = await checkAuthorization(clubId, id);
    if (authorization !== 'Authorized') {
      return res
        .status(StatusCodes.FORBIDDEN)
        .send('First become an admin to get admitted to the team.');
    }
    if (isAuthorized !== 'Fully-authorized') {
      return res
        .status(StatusCodes.FORBIDDEN)
        .send("You must be the main admin to edit the club's team.");
    }
    const club = await Club.findById(clubId, {
      team: 1,
      name: 1,
      secondaryImg: 1,
    });
    const userInfo = await User.findById(id, { pushToken: 1 });
    if (!club) {
      return res.status(StatusCodes.NOT_FOUND).send('Club not found.');
    }
    club.team.push(data);
    await club.save();
    scheduleNotification2({
      pushToken: [userInfo.pushToken],
      title: `Congratulations🎊🥳🎉!`,
      body: `You were promoted to ${pos} in ${club.name}`,
      url: `https://macbease-website.vercel.app/app/club/${clubId}/${club.name}/${club.secondaryImg}`,
    });
    return res.status(StatusCodes.OK).send('Successfully added to the team!');
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send('An error occurred while adding the team member.');
  }
};

//Controller 19
const removeTeamMember = async (req, res) => {
  if (req.user.role === 'user' || req.user.role === 'admin') {
    const { clubId, id } = req.body;
    const isAuthorized = await checkAuthorization(clubId, req.user.id);
    if (isAuthorized === 'Fully-authorized') {
      Club.findById(clubId, (err, club) => {
        if (err) return console.error(err);
        let team = club.team;
        team = team.filter((item) => item.id !== id);
        club.team = [];
        club.team = [...team];
        club.save((err, update) => {
          if (err) return console.error(err);
          return res
            .status(StatusCodes.OK)
            .send('Successfully removed from team!');
        });
      });
    } else {
      return res
        .status(StatusCodes.OK)
        .send("You have to be main admin to edit club's team.");
    }
  } else {
    return res
      .status(StatusCodes.OK)
      .send(
        "You are not authorized to access the route of updating club's team profile."
      );
  }
};

//Controller 20
const getAllEvents = async (req, res) => {
  if (req.user.role === 'admin' || req.user.role === 'user') {
    const { clubId } = req.query;
    const club = await Club.findById(clubId, { _id: 0, upcomingEvent: 1 });
    let upcomingEvents = club.upcomingEvent;
    let len = upcomingEvents.length;
    let finalData = [];
    for (let i = 0; i < len; i++) {
      let detail = await User.findById(upcomingEvents[i].postedBy, {
        name: 1,
        image: 1,
        _id: 0,
      });
      detail = detail._doc;
      finalData.push({ ...upcomingEvents[i], userDetail: { ...detail } });
    }
    return res.status(StatusCodes.OK).json(finalData);
  } else {
    return res
      .status(StatusCodes.OK)
      .send('You are not authorized to access the events of the club.');
  }
};

//Controller 21
const getClubsByTag = async (req, res) => {
  const { tag } = req.query;
  const clubs = await Club.find(
    { tags: new RegExp(tag, 'i', 'g') },
    { secondaryImg: 1, name: 1, tags: 1, motto: 1 }
  );
  if (req.user.role === 'user') {
    User.findById(req.user.id, (err, user) => {
      if (err) return console.error(err);
      user.lastActive = new Date();
      user.save();
    });
  } else if (req.user.role === 'admin') {
    Admin.findById(req.user.id, (err, admin) => {
      if (err) return console.error(err);
      admin.lastActive = new Date();
      admin.save();
    });
  }
  return res.status(StatusCodes.OK).json(clubs);
};

//Controller 22
const getLikeStatus = async (req, res) => {
  if (req.user.role === 'admin' || req.user.role === 'user') {
    const { contentId } = req.query;
    const content = await Content.findById(contentId, { likes: 1, _id: 0 });
    let liked = content.likes.includes(req.user.id);
    return res.status(StatusCodes.OK).json({ liked });
  } else {
    return res
      .status(StatusCodes.OK)
      .send('You are not authorized to get the like status. ');
  }
};

//Controller 23
const getLatestContent = async (req, res) => {
  const { clubId } = req.query;
  if (req.user.role === 'user') {
    const user = await User.findById(req.user.id);
    let lastActive = user.lastActive;
    lastActive = new Date(lastActive);
    let arr = [];
    Club.findById(clubId, (err, club) => {
      if (err) return console.error(err);
      let contents = club.content;
      for (let i = 0; i < contents.length; i++) {
        let content = contents[i];
        if (lastActive - new Date(content.timeStamp) < 0) arr.push(content);
      }
      return res.status(StatusCodes.OK).json(arr);
    });
  } else if (req.user.role === 'admin') {
    const admin = await Admin.findById(req.user.id);
    let lastActive = admin.lastActive;
    lastActive = new Date(lastActive);
    let arr = [];
    Club.findById(clubId, (err, club) => {
      if (err) return console.error(err);
      let contents = club.content;
      for (let i = 0; i < contents.length; i++) {
        let content = contents[i];
        if (lastActive - new Date(content.timeStamp) < 0) arr.push(content);
      }
      return res.status(StatusCodes.OK).json(arr);
    });
  }
};

//Controller 24
const getClubsPartOf = async (req, res) => {
  try {
    const { userId } = req.query;
    const userClubs = await User.aggregate([
      {
        $match: { _id: mongoose.Types.ObjectId(userId) },
      },
      {
        $project: {
          clubs: 1,
          _id: 0,
        },
      },
      {
        $unwind: '$clubs',
      },
      {
        $addFields: {
          clubObjectId: { $toObjectId: '$clubs.clubId' },
        },
      },
      {
        $lookup: {
          from: 'clubs',
          localField: 'clubObjectId',
          foreignField: '_id',
          as: 'clubDetails',
        },
      },
      {
        $unwind: '$clubDetails',
      },
      {
        $project: {
          clubId: '$clubs.clubId',
          joinDate: '$clubs.joinDate',
          badges: '$clubs.badges',
          name: '$clubDetails.name',
          secondaryImg: '$clubDetails.secondaryImg',
        },
      },
    ]);
    return res.status(StatusCodes.OK).json(userClubs);
  } catch (error) {
    console.log(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send('An error occurred while fetching club details');
  }
};

//Controller 25
const getClubProfile = async (req, res) => {
  const { clubId } = req.query;
  const club = await Club.findById(clubId, {
    _id: 0,
    name: 1,
    secondaryImg: 1,
    motto: 1,
  });
  return res.status(StatusCodes.OK).json(club);
};

//Controller 26
const updateRating = async (req, res) => {
  if (req.user.role === 'user' || req.user.role === 'admin') {
    const { clubId } = req.query;
    Club.findById(clubId, (err, club) => {
      if (err) return console.error(err);
      let members = club.members.length;
      let gallery = club.gallery.length;
      let events = club.upcomingEvent.length;
      let content = club.content.length;
      let rating = Math.floor(13.5 * (members + gallery + events + content));
      club.rating = rating;
      club.save((err, update) => {
        if (err) return console.error(err);
        return res.status(StatusCodes.OK).send('Updated rating!');
      });
    });
  }
};

//Controller 27
const getClubBio = async (req, res) => {
  if (req.user.role === 'user' || req.user.role === 'admin') {
    const { clubId } = req.query;
    let data = {
      featuringImg: '',
      motto: '',
      createdOn: '',
      totalMembers: '',
      totalEvents: '',
      ranking: '',
      team: [],
      tag: [],
    };
    let club = await Club.findById(clubId, {
      members: 1,
      upcomingEvent: 1,
      rating: 1,
      featuringImg: 1,
      motto: 1,
      tags: 1,
      createdOn: 1,
      team: 1,
    });
    data.totalMembers = club.members.length;
    data.totalEvents = club.upcomingEvent.length;
    data.ranking = club.rating;
    data.featuringImg = club.featuringImg;
    data.motto = club.motto;
    data.tag = club.tags;
    data.createdOn = club.createdOn;
    let n = club.team.length;
    for (let i = 0; i < n; i++) {
      let id = club.team[i].id;
      let user = await User.findById(id, { name: 1, image: 1, _id: 0 });
      let name = user.name;
      let image = user.image;
      data.team.push({ ...club.team[i], name, image });
    }
    return res.status(StatusCodes.OK).json(data);
  }
};

//Controller 28
const getClubContent = async (req, res) => {
  if (req.user.role === 'user' || req.user.role === 'admin') {
    const { clubId } = req.query;
    const club = await Club.findById(clubId, { content: 1, _id: 0 });
    return res.status(StatusCodes.OK).json(club);
  }
};

//Controller 29
const getClubGallery = async (req, res) => {
  if (req.user.role === 'user' || req.user.role === 'admin') {
    const { clubId, mode, batch, batchSize } = req.query;
    const club = await Club.findById(clubId, { gallery: 1, _id: 0 });
    let data = [];
    if (mode === 'tiles') {
      data = club.gallery.slice((batch - 1) * batchSize, batch * batchSize);
    } else {
      data = club.gallery.slice((batch - 1) * batchSize, batch * batchSize);
      for (let i = 0; i < data.length; i++) {
        const userId = data[i].postedBy;
        const userInfo = await User.findById(userId, {
          name: 1,
          image: 1,
          pushToken: 1,
        });
        data[i] = { ...data[i], userInfo };
      }
    }
    return res.status(StatusCodes.OK).json(data);
  }
};

// new controller added
const getClubVideos = async (req, res) => {
  if (req.user.role === 'user' || req.user.role === 'admin') {
    const { clubId } = req.query;
    const club = await Club.findById(clubId, { videos: 1, _id: 0 });
    let videos = club.videos;
    videos = videos.reverse();
    let len = videos.length;
    if (len > 6) {
      videos = videos.slice(0, 12);
    }
    let actualContent = [];
    for (let k = 0; k < videos.length; k++) {
      let contentId = videos[k].contentId;
      let actualData = await Content.findById(contentId);
      actualData = actualData._doc;
      let data = { ...actualData };
      actualContent.push(data);
    }
    let finishedContent = [];
    for (let l = 0; l < actualContent.length; l++) {
      let data = actualContent[l];
      let userId = data.idOfSender;
      let user = await User.findById(userId, {
        image: 1,
        name: 1,
        _id: 0,
        pushToken: 1,
      });
      let withPicData = {
        ...data,
        userName: user.name,
        userPic: user.image,
        userPushToken: user.pushToken,
      };
      finishedContent.push(withPicData);
    }
    return res.status(StatusCodes.OK).json(finishedContent);
  }
};

//Controller 30
const isAdmin = async (req, res) => {
  const { clubId } = req.query;
  let club = await Club.findById(clubId, { adminId: 1, _id: 0 });
  let admin = club.adminId;
  let result = admin.includes(req.user.id);
  return res.status(StatusCodes.OK).json(result);
};

//Controller 31
const isMember = async (req, res) => {
  const { clubId } = req.query;
  let club = await Club.findById(clubId, { members: 1, _id: 0 });
  let members = club.members;
  let result = members.includes(req.user.id);
  return res.status(StatusCodes.OK).json(result);
};

//Controller 32
const getClubNotifications = async (req, res) => {
  try {
    const { clubId, batch, batchSize } = req.query;
    const club = await Club.findById(clubId, { _id: 0, notifications: 1 });
    let notifications = club.notifications.slice(
      (batch - 1) * batchSize,
      batch * batchSize
    );
    if (batch === '1') {
      const isAuthorized = await checkAuthorization(clubId, req.user.id);
      const isTeamMember = await isInTeam(clubId, req.user.id);
      return res
        .status(StatusCodes.OK)
        .json({ notifications, isAuthorized, isTeamMember });
    }
    return res.status(StatusCodes.OK).json(notifications);
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).json('Something went wrong.');
  }
};

//Controller 35
const isMainAdmin = async (req, res) => {
  const { clubId } = req.query;
  const isAuthorized = await checkAuthorization(clubId, req.user.id);
  if (isAuthorized === 'Fully-authorized') {
    return res.status(StatusCodes.OK).send(true);
  } else {
    return res.status(StatusCodes.OK).send(false);
  }
};

//Controller 36
const getCreatorId = async (req, res) => {
  const { clubId } = req.query;
  if (req.user.role === 'user' || req.user.role === 'admin') {
    const club = await Club.findById(clubId, { mainAdmin: 1, _id: 0 });
    return res.status(StatusCodes.OK).json(club);
  }
};

//Controller 37
const getFastFeed = async (req, res) => {
  if (req.user.role === 'user') {
    const user = await User.findById(req.user.id, {
      clubs: 1,
      lastActive: 1,
      _id: 0,
    });
    let clubs = user.clubs;
    let lastActive = user.lastActive;
    lastActive = new Date(lastActive);
    let len = clubs.length;
    let totalContent = [];
    for (let i = 0; i < len; i++) {
      let clubId = clubs[i];
      let contents = await Club.findById(clubId.clubId, { content: 1, _id: 0 });
      contents = contents.content;
      totalContent.push(...contents);
    }
    let finalContent = totalContent;
    let actualContent = [];
    for (let k = 0; k < finalContent.length; k++) {
      let contentId = finalContent[k].contentId;
      let actualData = await Content.findById(contentId);
      actualData = actualData._doc;
      let data = { ...actualData };
      actualContent.push(data);
    }
    let finishedContent = [];
    for (let l = 0; l < actualContent.length; l++) {
      let data = actualContent[l];
      let userId = data.idOfSender;
      let clubId = data.belongsTo;
      let user = await User.findById(userId, { image: 1, name: 1, _id: 0 });
      let club = await Club.findById(clubId, {
        name: 1,
        secondaryImg: 1,
        _id: 0,
      });
      let withPicData = {
        ...data,
        userName: user.name,
        userPic: user.image,
        clubTitle: club.name,
        clubCover: club.secondaryImg,
      };
      finishedContent.push(withPicData);
    }
    return res.status(StatusCodes.OK).json({ finishedContent, lastActive });
  }
};

//Controller 38
const getStatus = async (req, res) => {
  const { clubId } = req.query;
  const id = req.user.id;
  try {
    const club = await Club.findById(clubId, {
      adminId: 1,
      mainAdmin: 1,
      _id: 0,
      members: 1,
      team: 1,
      undecidedProposals: 1,
    });
    if (!club) {
      return res.status(StatusCodes.NOT_FOUND).send('Club not found');
    }
    const isAuthorized =
      club.mainAdmin === id
        ? 'Fully-authorized'
        : club.adminId.includes(id)
        ? 'Authorized'
        : 'Not-authorized';
    const isMember = club.members.includes(id) ? 'Is a member' : 'Not a member';
    const isInTeam = club.team.some((member) => member.id === id)
      ? 'Team Member'
      : 'Not Team Member';
    return res.status(StatusCodes.OK).json({
      isAuthorized,
      isMember,
      isInTeam,
      undecidedProposals: club.undecidedProposals.length,
    });
  } catch (error) {
    console.log(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send('Error fetching status.');
  }
};

//Controller 39
const getFastNativeFeed = async (req, res) => {
  const { clubId, key, batch, batchSize, remedy } = req.query;
  try {
    const club = await Club.findById(clubId, {
      content: 1,
      _id: 0,
      upcomingEvent: 1,
    });
    let contents = club.content;
    contents = contents.reverse();
    if (batch && batchSize) {
      contents = contents.slice((batch - 1) * batchSize, batch * batchSize);
      contents = contents.slice(remedy);
    }
    let actualContent = [];
    for (let k = 0; k < contents.length; k++) {
      let contentId = contents[k].contentId;
      let actualData = await Content.findById(contentId);
      actualData = actualData._doc;
      let len = actualData.comments.length;
      actualData.comments = actualData.comments.slice(0, 6);
      let data = { ...actualData, commentsNum: len };
      actualContent.push(data);
    }
    const finishedContent = actualContent;
    return res.status(StatusCodes.OK).json({ finishedContent });
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).send('Something went wrong!');
  }
};

//Controller 40

const getClub = async (req, res) => {
  if (req.user.role === 'admin' || req.user.role === 'user') {
    const { clubId } = req.body;
    const club = await Club.findById(clubId);
    if (club) return res.status(StatusCodes.OK).json(club);
    else return res.status(StatusCodes.OK).send('Could not find the club.');
  } else {
    return res
      .status(StatusCodes.OK)
      .send('You are not authorized to access the club data.');
  }
};

//Controller 41
const getAllClub = async (req, res) => {
  if (req.user.role === 'admin' || req.user.role === 'user') {
    const clubs = await Club.find(
      {},
      { secondaryImg: 1, name: 1, tags: 1, motto: 1 }
    );
    return res.status(StatusCodes.OK).json(clubs);
  } else {
    return res
      .status(StatusCodes.OK)
      .send('You are not authorized to access the entire club data.');
  }
};

//Controller 43
const getAllLikedPins = async (req, res) => {
  const { key, mode, batch, batchSize, id } = req.query;
  const skip = (batch - 1) * batchSize;
  const limit = parseInt(batchSize);
  try {
    let likedContents = await User.findById(id || req.user.id, {
      likedContents: 1,
      taggedContents: 1,
      _id: 0,
    });
    if (!likedContents)
      return res.status(StatusCodes.OK).json({ likedSocialPins: [] });
    likedContents =
      mode === 'liked'
        ? likedContents.likedContents.reverse()
        : likedContents.taggedContents.reverse();
    const selectedBatch = likedContents.slice(skip, skip + limit);
    const macbeaseIds = selectedBatch
      .filter((item) => item.type === 'macbease' && key === 'all')
      .map((item) => mongoose.Types.ObjectId(item.contentId));
    const contentIds = selectedBatch
      .filter((item) => item.type !== 'macbease' || key !== 'all')
      .map((item) => mongoose.Types.ObjectId(item.contentId));
    const [macbeaseData, contentData] = await Promise.all([
      MacbeaseContent.aggregate([
        {
          $match: {
            _id: { $in: macbeaseIds },
          },
        },
        {
          $addFields: {
            commentsNum: { $size: '$comments' },
            comments: { $slice: ['$comments', 6] },
          },
        },
      ]),
      Content.aggregate([
        {
          $match: {
            _id: { $in: contentIds },
          },
        },
        {
          $addFields: {
            commentsNum: { $size: '$comments' },
            comments: { $slice: ['$comments', 6] },
          },
        },
      ]),
    ]);
    const data = [...macbeaseData, ...contentData].sort(
      (a, b) => new Date(b.timeStamp) - new Date(a.timeStamp)
    );
    return res.status(StatusCodes.OK).json({ likedSocialPins: data });
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send('Error fetching liked pins.');
  }
};

//Controller 44
const getSimilarGroups = async (req, res) => {
  if (req.user.role === 'user') {
    let clubs = await Club.find(
      {},
      { secondaryImg: 1, name: 1, tags: 1, motto: 1, _id: 1 }
    );
    let communities = await Community.find(
      {},
      {
        secondaryCover: 1,
        title: 1,
        tag: 1,
        activeMembers: 1,
        label: 1,
        _id: 1,
      }
    );
    let user = await User.findById(req.user.id, {
      communitiesPartOf: 1,
      _id: 0,
      clubs: 1,
    });
    let communitiesPartOf = user.communitiesPartOf;
    let clubsPartOf = user.clubs;
    let l1 = communitiesPartOf.length;
    let communityIds = [];
    for (let i = 0; i < l1; i++) {
      let point = communitiesPartOf[i].communityId;
      communityIds.push(point);
    }
    let l2 = communities.length;
    let finalCommunityData = [];
    for (let j = 0; j < l2; j++) {
      let id = communities[j]._id;
      id = id.toString();
      if (!communityIds.includes(id)) {
        finalCommunityData.push(communities[j]);
      }
    }
    let l3 = clubsPartOf.length;
    let clubIds = [];
    for (let k = 0; k < l3; k++) {
      let point = clubsPartOf[k].clubId;
      clubIds.push(point);
    }
    let l4 = clubs.length;
    let finalClubData = [];
    for (let l = 0; l < l4; l++) {
      let icd = clubs[l]._id;
      icd = icd.toString();
      if (!clubIds.includes(icd)) {
        finalClubData.push(clubs[l]);
      }
    }
    return res.status(StatusCodes.OK).json({
      community: finalCommunityData,
      club: finalClubData,
      all: [...clubs, ...communities],
    });
  }
};

//Controller 45
const getEveryoneOfClub = async (req, res) => {
  try {
    if (req.user.role === 'admin' || req.user.role === 'user') {
      const { clubId } = req.query;
      const club = await Club.findById(clubId, {
        members: 1,
        adminId: 1,
        team: 1,
        _id: 0,
        mainAdmin: 1,
        unusedBadges: 1,
      });
      const { members, adminId, team, unusedBadges } = club;
      const allUserIds = [...members, ...team.map((t) => t.id)];
      const users = await User.find(
        { _id: { $in: allUserIds } },
        { name: 1, image: 1, pushToken: 1, course: 1 }
      ).lean();
      const userMap = users.reduce((acc, user) => {
        acc[user._id] = user;
        return acc;
      }, {});
      let finalMembers = [];
      let finalAdmins = [];
      let finalTeam = [];
      for (let i = 0; i < members.length; i++) {
        let user = userMap[members[i]];
        if (adminId.includes(members[i])) {
          finalAdmins.push(user);
        } else {
          finalMembers.push(user);
        }
      }

      for (let j = 0; j < team.length; j++) {
        let user = userMap[team[j].id];
        if (user) {
          finalTeam.push({ ...user, pos: team[j].pos });
        }
      }
      return res.status(StatusCodes.OK).json({
        finalMembers,
        finalAdmins,
        finalTeam,
        unusedBadges,
      });
    }
  } catch (error) {
    console.log(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send('An error occurred while fetching club details');
  }
};

//Controller 46
const getAllContent = async (req, res) => {
  if (req.user.role === 'user' || req.user.role === 'admin') {
    const { clubId } = req.query;
    const club = await Club.findById(clubId, { content: 1, _id: 0 });
    let contents = club.content;
    let actualContent = [];
    for (let k = 0; k < contents.length; k++) {
      let contentId = contents[k].contentId;
      let actualData = await Content.findById(contentId);
      actualData = actualData._doc;
      let data = { ...actualData };
      actualContent.push(data);
    }
    let finishedContent = [];
    for (let l = 0; l < actualContent.length; l++) {
      let data = actualContent[l];
      let userId = data.idOfSender;
      let clubId = data.belongsTo;
      let user = await User.findById(userId, { image: 1, name: 1, _id: 0 });
      let club = await Club.findById(clubId, {
        name: 1,
        secondaryImg: 1,
        _id: 0,
      });
      let withPicData = {
        ...data,
        userName: user.name,
        userPic: user.image,
        clubTitle: club.name,
        communityCover: club.secondaryImg,
      };
      finishedContent.push(withPicData);
    }
    return res.status(StatusCodes.OK).json({ finishedContent });
  }
};

//Controller 47
const getPushTokenChunk = async (req, res) => {
  const { mode, clubId } = req.query;
  let pushTokens = [];
  if (mode === 'all') {
    let members = await Club.findById(clubId, { members: 1, _id: 0 });
    members = members.members;
    let len = members.length;
    for (let i = 0; i < len; i++) {
      let id = members[i];
      let user = await User.findById(id, { pushToken: 1 });
      if (user) {
        pushTokens.push(user.pushToken);
      }
    }
  } else if (mode === 'admin') {
    let members = await Club.findById(clubId, { adminId: 1, _id: 0 });
    members = members.adminId;
    let len = members.length;
    for (let i = 0; i < len; i++) {
      let id = members[i];
      let user = await User.findById(id, { pushToken: 1 });
      if (user) {
        pushTokens.push(user.pushToken);
      }
    }
  } else if (mode === 'team') {
    let members = await Club.findById(clubId, { team: 1, _id: 0 });
    members = members.team;
    let len = members.length;
    for (let i = 0; i < len; i++) {
      let id = members[i].id;
      let user = await User.findById(id, { pushToken: 1 });
      if (user) {
        pushTokens.push(user.pushToken);
      }
    }
  }
  return res.status(StatusCodes.OK).json(pushTokens);
};

//Controller 48
const changeLeader = async (req, res) => {
  const { clubId, leaderId, invitationId } = req.query;
  try {
    const cond1 = leaderId === req.user.id;
    let club = await Club.findById(clubId, {
      mainAdmin: 1,
      featuringImg: 1,
      secondaryImg: 1,
      name: 1,
    });
    let invitation = await Invitation.findById(invitationId);
    const cond2 =
      invitation.type === 'Leader Change' &&
      invitation.state === 'undecided' &&
      invitation.sentBy.toString() === club.mainAdmin;
    invitation.sentTo.toString() === req.user.id;
    if (cond1 && cond2) {
      let prevLeader = await User.findById(club.mainAdmin, {
        unreadNotice: 1,
        name: 1,
        image: 1,
        pushToken: 1,
      });
      let newLeader = await User.findById(leaderId, {
        unreadNotice: 1,
        name: 1,
        image: 1,
        pushToken: 1,
      });
      const noticeForPrev = {
        value: `Congratulations! ${newLeader.name} has accepted your proposal to lead ${club.name}.`,
        img1: newLeader.image,
        img2: club.featuringImg,
        key: 'read',
        action: 'club',
        params: {
          name: club.name,
          secondaryImg: club.secondaryImg,
          id: clubId,
        },
        time: new Date(),
        uid: `${new Date()}/${club.mainAdmin}/${req.user.id}`,
      };
      const noticeForNew = {
        value: `Congratulations! You are now the CEO of ${club.name}.`,
        img1: prevLeader.image,
        img2: club.featuringImg,
        key: 'read',
        action: 'club',
        params: {
          name: club.name,
          secondaryImg: club.secondaryImg,
          id: clubId,
        },
        time: new Date(),
        uid: `${new Date()}/${club.mainAdmin}/${req.user.id}`,
      };
      club.mainAdmin = leaderId;
      invitation.state = 'accepted';
      prevLeader.unreadNotice = [noticeForPrev, ...prevLeader.unreadNotice];
      newLeader.unreadNotice = [noticeForNew, ...newLeader.unreadNotice];
      prevLeader.save();
      newLeader.save();
      club.save();
      invitation.save();
      return res
        .status(StatusCodes.OK)
        .send('Leader has been chnaged successfully.');
    } else {
      return res
        .status(StatusCodes.OK)
        .send(
          'You are not authorized to become the leader of the concerned club.'
        );
    }
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).send('Something went wrong.');
  }
};

//Controller 49
const getClubContributions = async (req, res) => {
  const { id, batch, batchSize } = req.query;
  const skip = (batch - 1) * batchSize;
  try {
    const user = await User.findById(id, {
      clubContributions: { $slice: [skip, parseInt(batchSize)] },
    }).lean();

    if (!user || !user.clubContributions) {
      return res.status(StatusCodes.OK).json([]);
    }
    const relevantIds = user.clubContributions.map((item) =>
      mongoose.Types.ObjectId(item)
    );
    const contributions = await Content.aggregate([
      {
        $match: {
          _id: { $in: relevantIds },
        },
      },
      {
        $addFields: {
          commentsNum: { $size: '$comments' },
          comments: { $slice: ['$comments', 6] },
        },
      },
      {
        $sort: { timeStamp: -1 },
      },
    ]);
    return res.status(StatusCodes.OK).json(contributions);
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send('Error fetching club contributions.');
  }
};

//Controller 50
const addProposal = async (req, res) => {
  try {
    const { proposalId, clubId, visibility } = req.body;
    const club = await Club.findById(clubId, {
      undecidedProposals: 1,
      proposalHistory: 1,
      name: 1,
    });
    const proposal = await Invitation.findById(proposalId);
    const senderMetaData = await User.findById(proposal.sentBy, {
      name: 1,
      image: 1,
      pushToken: 1,
    });
    const obj = {
      id: proposalId,
      visibility,
      state: proposal.state,
      subject: proposal.subject,
      senderMetaData,
    };
    club.proposalHistory.push(obj);
    club.undecidedProposals.push(proposalId);
    club.save();

    //scheduling a job for dispatching push notification
    let oneSec = new Date(Date.now() + 1000);
    schedule.scheduleJob(
      `proposal_notice_${proposal._id}`,
      oneSec,
      async () => {
        const ids = [proposal.sentTo, ...proposal.cc];
        const users = await User.find({ _id: { $in: ids } }, { pushToken: 1 });
        const tokens = users.map((item) => item.pushToken);
        scheduleNotification(
          tokens,
          club.name,
          `A proposal has been raised in ${club.name} for you to address.`
        );
      }
    );
    return res.status(StatusCodes.OK).send('Successfully submitted proposal.');
  } catch (error) {
    console.log(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send('Error setting proposal.');
  }
};

//Controller 51
const fetchProposals = async (req, res) => {
  const { clubId, batch, batchSize } = req.query;
  try {
    const club = await Club.aggregate([
      { $match: { _id: mongoose.Types.ObjectId(clubId) } },
      {
        $project: {
          proposalHistory: {
            $slice: [
              { $reverseArray: '$proposalHistory' },
              (batch - 1) * batchSize,
              parseInt(batchSize),
            ],
          },
          undecidedProposals: 1,
        },
      },
    ]);
    const proposals = club[0].proposalHistory;
    if (proposals) {
      const proposalIds = proposals.map((item) => item.id);
      const proposalsDoc = await Invitation.find(
        { _id: { $in: proposalIds } },
        { endorsedBy: 1, expiration: 1 }
      );
      const proposalsDocMap = proposalsDoc.reduce((acc, doc) => {
        acc[doc._id.toString()] = doc;
        return acc;
      }, {});
      const finalData = proposals.map((proposal) => {
        const proposalData = proposalsDocMap[proposal.id.toString()];
        if (proposalData) {
          return {
            ...proposal,
            endorsedBy: proposalData.endorsedBy,
            expiration: proposalData.expiration,
          };
        }
        return proposal;
      });
      if (parseInt(batch) !== 1) {
        return res.status(StatusCodes.OK).json(finalData);
      } else {
        return res
          .status(StatusCodes.OK)
          .json({ finalData, undecidedProposals: club[0].undecidedProposals });
      }
    } else {
      return res.status(StatusCodes.OK).json([]);
    }
  } catch (error) {
    console.log(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send('Error fetching proposals.');
  }
};

// Controller 52
const changeProposalStatus = async (req, res) => {
  const { proposalId, clubId, status } = req.body;
  try {
    if (!['accepted', 'rejected'].includes(status)) {
      return res.status(StatusCodes.BAD_REQUEST).send('Invalid status.');
    }
    const proposal = await Invitation.findById(proposalId, {
      sentTo: 1,
      cc: 1,
    });
    if (![...proposal.cc, proposal.sentTo.toString()].includes(req.user.id)) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .send('You are not authorized to reject this proposal.');
    }
    const club = await Club.findById(clubId, {
      undecidedProposals: 1,
      proposalHistory: 1,
      notifications: 1,
    });
    if (!club) {
      return res.status(StatusCodes.NOT_FOUND).send('Club not found.');
    }
    club.undecidedProposals = club.undecidedProposals.filter(
      (id) => id !== proposalId
    );
    let matchedProposal;
    for (let i = 0; i < club.proposalHistory.length; i++) {
      if (club.proposalHistory[i].id === proposalId) {
        matchedProposal = club.proposalHistory[i];
        matchedProposal.state = status;
        club.proposalHistory[i] = matchedProposal;
        break;
      }
    }
    if (!matchedProposal) {
      return res.status(StatusCodes.NOT_FOUND).send('Proposal not found.');
    }
    const userDetails = await User.findById(req.user.id, {
      name: 1,
      image: 1,
      _id: 0,
    });
    const notice = {
      uid: new Date().toISOString() + `${proposalId}`,
      title: 'Decision made',
      msg: `Proposal titled - ${matchedProposal.subject} was reviewed and decision was taken.`,
      visibility: matchedProposal.visibility,
      createdAt: getCurrentISTDate(),
      postedBy: req.user.id,
      name: userDetails.name,
      image: userDetails.image,
    };
    club.notifications.unshift(notice);
    club.save();
    return res
      .status(StatusCodes.OK)
      .send('Proposal status successfully modified.');
  } catch (error) {
    console.log(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send('Error changing status of club proposal.');
  }
};

//Controller 53
const searchClubProposals = async (req, res) => {
  try {
    const { clubId, query } = req.query;
    const searchQuery = query.toLowerCase();
    const club = await Club.findOne(
      {
        _id: clubId,
        'proposalHistory.subject': { $regex: searchQuery, $options: 'i' },
      },
      { 'proposalHistory.$': 1 }
    );
    if (!club || club.proposalHistory.length === 0) {
      return res.status(StatusCodes.OK).json({ finalData: [] });
    }
    const filteredProposals = club.proposalHistory;
    const proposalIds = filteredProposals.map((item) => item.id);
    const proposalsDoc = await Invitation.find(
      { _id: { $in: proposalIds } },
      { endorsedBy: 1, expiration: 1 }
    );
    const proposalsDocMap = proposalsDoc.reduce((acc, doc) => {
      acc[doc._id.toString()] = doc;
      return acc;
    }, {});
    const finalData = filteredProposals.map((proposal) => {
      const proposalData = proposalsDocMap[proposal.id.toString()];
      if (proposalData) {
        return {
          ...proposal,
          endorsedBy: proposalData.endorsedBy,
          expiration: proposalData.expiration,
        };
      }
      return proposal;
    });
    return res.status(StatusCodes.OK).json(finalData);
  } catch (error) {
    console.log(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send('Error searching the proposal.');
  }
};

const nullifyClubDynamicIsland = async (req, res) => {
  try {
    const { type, clubId } = req.query;
    await updateDynamicIsland(
      [mongoose.Types.ObjectId(req.user.id)],
      clubId,
      type
    );
    return res.status(StatusCodes.OK).send(`${type} nullified.`);
  } catch (error) {
    console.log(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send('Cannot restore dynamic island.');
  }
};

const newClubMessage = async (req, res) => {
  try {
    const { clubId, message, sender } = req.body;
    const clubInfo = await Club.findById(clubId, {
      pinnedBy: 1,
      name: 1,
      secondaryImg: 1,
    });
    const tokens = await getPushTokens(
      `${clubId}-All Members-club`,
      req.user.id
    );
    await updateDynamicIsland(clubInfo.pinnedBy, clubId, 'messages', true);
    scheduleNotification2({
      pushToken: tokens,
      title: `${sender} messaged in ${clubInfo.name}.`,
      body: `${message.substring(0, 50)}...`,
      url: `https://macbease-website.vercel.app/app/club/${clubId}/${clubInfo.name}/${clubInfo.secondaryImg}`,
    });
  } catch (error) {
    console.log(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send('Cannot mark new club chat message.');
  }
};

module.exports = {
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
};
