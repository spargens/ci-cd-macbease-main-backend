const { StatusCodes } = require('http-status-codes');
const Ticket = require('../models/ticket');
const Event = require('../models/event');
const User = require('../models/user');
const Club = require('../models/club');
const { sendMail, scheduleNotification } = require('../controllers/utils');
const schedule = require('node-schedule');

//middleware
const checkAuthorization = async (ticketId, role, id) => {
  const ticket = await Ticket.findById(ticketId);
  const eventId = ticket.eventId;
  const event = await Event.findById(eventId, { belongsTo: 1 });
  const belongsTo = event.belongsTo;
  if (role === 'admin') {
    return true;
  } else {
    if (belongsTo.type === 'Club') {
      const club = await Club.findById(belongsTo.id, { adminId: 1 });
      const adminIds = club.adminId;
      if (adminIds.includes(id)) {
        return true;
      }
    }
    return false;
  }
};

//Controller 1
const generateTicket = async (req, res) => {
  try {
    const { eventId, paymentId, amtPaid, type } = req.body;
    if (!eventId || !paymentId || !amtPaid || !type) {
      return res
        .status(StatusCodes.OK)
        .send('Insufficient data to create a ticket.');
    }
    const ticket = await Ticket.create({
      eventId,
      paymentId,
      amtPaid,
      boughtBy: req.user.id,
      generatedAt: new Date(),
      type,
    });
    let event = await Event.findById(eventId, {
      bookedBy: 1,
      ticketSellingDays: 1,
      cumulativeRevenue: 1,
      courseAnalytics: 1,
      name: 1,
      eventManagerMail: 1,
      url: 1,
      authorizedPerson: 1,
    });
    let user = await User.findById(req.user.id, {
      ticketsBought: 1,
      field: 1,
      email: 1,
      name: 1,
      image: 1,
      unreadNotice: 1,
      pushToken: 1,
    });
    user.ticketsBought = [ticket._id, ...user.ticketsBought];
    event.bookedBy = [ticket._id, ...event.bookedBy];

    //in-app notice to user
    const notice = {
      value: `You have purchased the ticket for ${event.name}`,
      img1: user.image,
      img2: event.url,
      key: 'event',
      action: 'yourTickets',
      params: {},
      time: new Date(),
      uid: `${new Date()}/${ticket._id}/${req.user.id}`,
    };
    user.unreadNotice = [notice, ...user.unreadNotice];

    //generating event analytics
    let days = event.ticketSellingDays;
    let index = days.length;
    let currentDate = new Date();
    let year = currentDate.getFullYear();
    let month = currentDate.getMonth() + 1;
    let day = currentDate.getDate();
    let formattedDate = `${year}-${month < 10 ? '0' + month : month}-${
      day < 10 ? '0' + day : day
    }`;
    for (let i = 0; i < days.length; i++) {
      if (formattedDate === days[i]) {
        index = i;
      }
    }
    if (index === days.length) {
      event.ticketSellingDays[index] = formattedDate;
      event.cumulativeRevenue[index] = amtPaid;
    } else {
      event.cumulativeRevenue[index] = event.cumulativeRevenue[index] + amtPaid;
    }
    let courseAnalyticsIndex = event.courseAnalytics.length;
    for (let j = 0; j < event.courseAnalytics.length; j++) {
      let point = event.courseAnalytics[j];
      if (point.course === user.field) {
        courseAnalyticsIndex = j;
      }
    }
    if (courseAnalyticsIndex === event.courseAnalytics.length) {
      event.courseAnalytics[courseAnalyticsIndex] = {
        course: user.field,
        count: 1,
      };
    } else {
      let newCount = event.courseAnalytics[courseAnalyticsIndex].count + 1;
      event.courseAnalytics[courseAnalyticsIndex] = {
        course: user.field,
        count: newCount,
      };
    }

    //scheduling a job for secondary communication
    let threeSec = new Date(Date.now() + 1 * 3 * 1000);
    schedule.scheduleJob(
      `ticketPurchased_${req.user.id}_${new Date()}`,
      threeSec,
      async () => {
        //sending an email to the user
        const name = user.name;
        const intro = [
          `Thank you for purchasing the ticket for the event ${event.name}.Your ticket is available on your Macbease account.`,
          'We will see you there.',
        ];
        const outro = `For any queries please mail on ${event.eventManagerMail} or post query on event faq console.`;
        const subject = 'Macbease Ticket';
        const destination = [user.email];
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
        //sending a push notification to user
        scheduleNotification(
          [user.pushToken],
          'Ticket successfully purchased!',
          `Ticket for ${event.name} has been added into your account.`
        );
        //sending push notice to authorized person
        if (event?.authorizedPerson?.pushToken) {
          scheduleNotification(
            [event.authorizedPerson.pushToken],
            'Congratulations! Ticket successfully sold.',
            `To see live statistics please visit your event console.`
          );
        }
      }
    );
    user.save();
    event.save();
    return res.status(StatusCodes.OK).json({ ticket });
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).send('Something went wrong.');
  }
};

//Controller 2
const scanTicket = async (req, res) => {
  const { ticketId, eventId } = req.body;
  try {
    const isAuthorized = await checkAuthorization(
      ticketId,
      req.user.role,
      req.user.id
    );
    if (isAuthorized) {
      let ticket = await Ticket.findById(ticketId);
      if (ticket) {
        const userInfo = await User.findById(ticket.boughtBy, {
          name: 1,
          image: 1,
          reg: 1,
          pushToken: 1,
        });
        if (
          ticket.status === 'active' &&
          ticket.eventId.toString() === eventId
        ) {
          ticket.status = 'redeemed';
          ticket.save();

          //scheduling a job for notification to the buyer
          let threeSec = new Date(Date.now() + 1 * 3 * 1000);
          schedule.scheduleJob(`push_${userInfo._id}`, threeSec, async () => {
            const eventInfo = await Event.findById(eventId, { name: 1 });
            scheduleNotification(
              [userInfo.pushToken],
              `Welcome to ${eventInfo.name}`,
              `Enjoy the event and Carpe Diem!`
            );
          });

          return res
            .status(StatusCodes.OK)
            .json({ msg: 'Ticket scan successful.', userInfo });
        } else {
          return res
            .status(StatusCodes.OK)
            .json({ msg: 'Ticket scan unsuccessful.', userInfo });
        }
      } else {
        return res.status(StatusCodes.OK).json({ msg: 'Invalid ticket id.' });
      }
    } else {
      return res.status(StatusCodes.OK).send('You are not authorized.');
    }
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).send('Something went wrong.');
  }
};

//Controller 3
const reviewEvent = async (req, res) => {
  const { ticketId, reviewMsg, reviewUrls, reviewStars } = req.body;
  try {
    let ticket = await Ticket.findById(ticketId, {
      reviewMsg: 1,
      reviewStars: 1,
      reviewUrls: 1,
    });
    ticket.reviewMsg = reviewMsg;
    ticket.reviewStars = reviewStars;
    ticket.reviewUrls = reviewUrls;
    ticket.save();
    return res.status(StatusCodes.OK).send('Event reviewed successfully.');
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).send('Something went wrong.');
  }
};

const likeReview = async (req, res) => {
  try {
    const { ticketId } = req.query;
    let ticket = await Ticket.findById(ticketId, { reviewLiked: 1 });
    ticket.reviewLiked = true;
    ticket.save();
    return res.status(StatusCodes.OK).send('Review successfully liked.');
  } catch (error) {
    console.log(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send('Something went wrong.');
  }
};

const unLikeReview = async (req, res) => {
  try {
    const { ticketId } = req.query;
    let ticket = await Ticket.findById(ticketId, { reviewLiked: 1 });
    ticket.reviewLiked = false;
    ticket.save();
    return res.status(StatusCodes.OK).send('Review successfully unliked.');
  } catch (error) {
    console.log(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send('Something went wrong.');
  }
};

module.exports = {
  generateTicket,
  scanTicket,
  reviewEvent,
  likeReview,
  unLikeReview,
};
