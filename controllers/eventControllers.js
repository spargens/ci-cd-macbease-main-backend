const { StatusCodes } = require('http-status-codes');
const Event = require('../models/event');
const Club = require('../models/club');
const User = require('../models/user');
const Ticket = require('../models/ticket');
const schedule = require('node-schedule');
const PDFDocument = require('pdfkit');
require('dotenv').config();
const { sendMail, scheduleNotification } = require('../controllers/utils');
const { default: mongoose } = require('mongoose');

//MiddleWare
const isAuthorized = async (id, role, belongsTo) => {
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
const createEvent = async (req, res) => {
  if (req.user.role === 'admin') {
    const event = await Event.create({ ...req.body });
    return res.status(StatusCodes.CREATED).json({ event });
  } else {
    return res
      .status(StatusCodes.MISDIRECTED_REQUEST)
      .send('Sorry you are not authorized to create an event.');
  }
};

//Controller 2
const getAllEvents = async (req, res) => {
  const { status, batch, batchSize } = req.query;
  if (status) {
    const events = await Event.find(
      { status },
      {
        bookedBy: 0,
        amtPaid: 0,
        amtPaidTo: 0,
        ticketSellingDays: 0,
        cumulativeRevenue: 0,
        courseAnalytics: 0,
        faq: 0,
      }
    );
    return res.status(StatusCodes.OK).json(events);
  } else {
    const count = await Event.countDocuments();
    let startIndex = count - batch * batchSize;
    let endIndex = batchSize;
    if (startIndex < 0) {
      endIndex = batchSize - Math.abs(startIndex);
      startIndex = 0;
    }
    const events = await Event.find({}).skip(startIndex).limit(endIndex);
    return res.status(StatusCodes.OK).json(events.reverse());
  }
};

//Controller 3
const changeEventStatus = async (req, res) => {
  if (req.user.role === 'admin') {
    const { status, id } = req.query;
    try {
      let event = await Event.findById(id, {
        bookedBy: 0,
        amtPaid: 0,
        amtPaidTo: 0,
        ticketSellingDays: 0,
        cumulativeRevenue: 0,
        courseAnalytics: 0,
        faq: 0,
      });
      event.status = status;
      event.save();

      //scheduling a job to update event feed
      if (status === 'featured') {
        let threeSec = new Date(Date.now() + 1 * 3 * 1000);
        schedule.scheduleJob(
          `eventFeed_${req.user.id}_${new Date()}`,
          threeSec,
          async () => {
            //pushing event into every user's event feed
            let users = await User.find({});
            for (let i = 0; i < users.length; i++) {
              let user = users[i];
              user.eventFeed = [
                {
                  ...event._doc,
                  header: 'You might find this event interesting',
                },
                ...user.eventFeed,
              ];
              user.save();
            }
            //sending an email to the event manager and notification to all the members
            if (event.belongsTo.type === 'Club') {
              const belongsTo = event.belongsTo;
              let clubId = belongsTo.id;
              let clubDetails = await Club.findById(clubId, {
                name: 1,
                mainAdmin: 1,
                _id: 0,
                members: 1,
                secondaryImg: 1,
              });
              let userDetail = await User.findById(clubDetails.mainAdmin, {
                name: 1,
                email: 1,
                _id: 0,
              });
              const intro = [
                'Congratulations! We at Macbease are delighted to deliver you a great news.',
                `The event ${event.name} posted in your club ${clubDetails.name} has been selected to be featured on Macbease event console. Tickets are live now!`,
              ];
              const outro =
                'We wish you a great event. The team at Macbease will always be more than willing to help you.';
              const subject = `Confirmation- ${event.name}`;
              const destination = [userDetail.email, event.eventManagerMail];
              const name = `Team ${clubDetails.name}`;
              const { ses, params } = await sendMail(
                name,
                intro,
                outro,
                subject,
                destination
              );
              await ses.sendEmail(params).promise();

              //code for notification begins here
              const members = await User.find(
                {
                  _id: { $in: clubDetails.members },
                },
                { pushToken: 1, name: 1, email: 1, unreadNotice: 1 }
              );
              for (let i = 0; i < members.length; i++) {
                const member = dummy[i];
                const intro = [
                  'Congratulations! We at Macbease are delighted to deliver you a great news.',
                  `The event ${event.name} posted in your club ${clubDetails.name} is now featuring on Macbease. Tickets are live, go buy one for yourself!`,
                ];
                const outro = 'We will see you at the event.';
                const subject = `Great update- ${event.name}`;
                const destination = [member.email];
                const name = `${member.name}`;
                const { ses, params } = await sendMail(
                  name,
                  intro,
                  outro,
                  subject,
                  destination
                );
                const notice = {
                  value: `Tickets for ${event.name} organized by ${clubDetails.name} is live. Go and buy one!`,
                  img1: clubDetails.secondaryImg,
                  img2: event.url,
                  key: 'event',
                  action: 'club',
                  params: {
                    name: clubDetails.name,
                    secondaryImg: clubDetails.secondaryImg,
                    id: clubId,
                  },
                  time: new Date(),
                  uid: `${new Date()}/${event._id}/ticketLive`,
                };
                member.unreadNotice = [notice, ...member.unreadNotice];
                member.save();
                await ses.sendEmail(params).promise();
                scheduleNotification(
                  [member.pushToken],
                  `Hi ${member.name}`,
                  `Tickets for ${event.name} organized by ${clubDetails.name} is live. Go and buy one!`
                );
              }
            }
          }
        );
        return res
          .status(StatusCodes.OK)
          .send('Event status changed successfully.');
      } else {
        return res
          .status(StatusCodes.OK)
          .send('Event status changed successfully.');
      }
    } catch (error) {
      console.log(error);
      return res.status(StatusCodes.OK).send('Something went wrong.');
    }
  } else {
    return res
      .status(StatusCodes.OK)
      .send('You are not authorized to change the status of the event!');
  }
};

//Controller 4
const addClubEvent = async (req, res) => {
  const event = await Event.create({ ...req.body, status: 'pending' });
  return res.status(StatusCodes.CREATED).json({
    msg: 'Event was successfully posted for featuring. Decision pending.',
    eventId: event._id,
  });
};

//Controller 5
const deleteEvent = async (req, res) => {
  if (req.user.role === 'admin') {
    const { eventId } = req.body;
    const deletedEvent = await Event.findByIdAndRemove({ _id: eventId });
    if (deletedEvent) {
      return res.status(StatusCodes.OK).json({ deletedEvent });
    }
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send('Was unable to find event and delete it!');
  } else {
    return res
      .status(StatusCodes.MISDIRECTED_REQUEST)
      .send('You are not authorized to delete the event.');
  }
};

//Controller 7
const getTicketsBought = async (req, res) => {
  const { key } = req.query;
  try {
    const user = await User.findById(req.user.id, { ticketsBought: 1, _id: 0 });
    let ticketsBought = user.ticketsBought;
    let len = ticketsBought.length;
    if (key !== 'all' && len > 6) {
      len = 6;
    }
    let arr = [];
    for (let i = 0; i < len; i++) {
      const ticketId = ticketsBought[i];
      const ticket = await Ticket.findById(ticketId);
      let actualEvent = await Event.findById(ticket.eventId, {
        bookedBy: 0,
        cumulativeRevenue: 0,
        ticketSellingDays: 0,
        courseAnalytics: 0,
        faq: 0,
        description: 0,
      });
      actualEvent = actualEvent._doc;
      let dataPoint = {
        ...actualEvent,
        pricePaid: ticket.amtPaid,
        ticketData: ticket,
        status: ticket.status,
      };
      arr.push(dataPoint);
    }
    return res.status(StatusCodes.OK).json({ arr: arr, length: len });
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).send('Something went wrong.');
  }
};

//helper function to convert "2024-03-12" into 12 Mar
function formatDate(inputDate) {
  const dateParts = inputDate.split('-');
  const year = parseInt(dateParts[0]);
  const month = parseInt(dateParts[1]) - 1;
  const day = parseInt(dateParts[2]);
  const dateObject = new Date(year, month, day);
  const formattedDate = dateObject.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
  });
  return formattedDate;
}

//Controller 8
const getEventAnalytics = async (req, res) => {
  const { eventId } = req.query;
  try {
    const event = await Event.findById(eventId);
    let revenue = event.cumulativeRevenue;
    let dates = event.ticketSellingDays;
    let graphData = [];
    for (let i = 0; i < revenue.length; i++) {
      let obj = {
        value: revenue[i],
        dataPointText: `₹${revenue[i]}`,
        label: formatDate(dates[i]),
      };
      graphData.push(obj);
    }
    let courseAnalyticsData = [];
    let courseAnalytics = event.courseAnalytics;
    if (courseAnalytics.length < 4) {
      for (let j = 0; j < courseAnalytics.length; j++) {
        let obj = {
          value: courseAnalytics[j].count,
          text: courseAnalytics[j].course,
        };
        courseAnalyticsData.push(obj);
      }
    } else {
      for (let j = 0; j < 3; j++) {
        for (let k = j + 1; k < courseAnalytics.length; k++) {
          let first = courseAnalytics[j];
          let second = courseAnalytics[k];
          if (first.count < second.count) {
            courseAnalytics[j] = second;
            courseAnalytics[k] = first;
          }
        }
      }
      for (let l = 0; l < 3; l++) {
        let obj = {
          value: courseAnalytics[l].count,
          text: courseAnalytics[l].course,
        };
        courseAnalyticsData.push(obj);
      }
    }
    const ticketSold = event.bookedBy.length;
    return res.status(StatusCodes.OK).json({
      graphData,
      courseAnalyticsData,
      ticketSold,
    });
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).send('Something went wrong.');
  }
};

//Controller 9
const getCustomAnalytics = async (req, res) => {
  const { mode, eventId } = req.query;
  try {
    const event = await Event.findById(eventId);
    const bookedBy = event.bookedBy;
    const len = bookedBy.length;
    let UG = 0;
    let PG = 0;
    let PhD = 0;
    let yearArr = [
      { text: new Date().getFullYear(), value: 0 },
      { text: new Date().getFullYear() + 1, value: 0 },
      { text: new Date().getFullYear() + 2, value: 0 },
      { text: new Date().getFullYear() + 3, value: 0 },
    ];
    for (let i = 0; i < len; i++) {
      const ticketId = bookedBy[i];
      const ticket = await Ticket.findById(ticketId, { boughtBy: 1, _id: 0 });
      const user = await User.findById(ticket.boughtBy, {
        level: 1,
        _id: 0,
        passoutYear: 1,
      });
      if (mode === 'Level') {
        if (user.level === 'UG') {
          UG = UG + 1;
        } else if (user.level === 'PG') {
          PG = PG + 1;
        } else if (user.level === 'PhD') {
          PhD = PhD + 1;
        }
      } else if (mode === 'Year') {
        const passoutYear = user.passoutYear;
        const index = passoutYear - new Date().getFullYear();
        yearArr[index].value += 1;
      }
    }
    if (mode === 'Level') {
      const pieData = [
        { value: UG, text: 'UnderGraduate' },
        { value: PG, text: 'PostGraduate' },
        { value: PhD, text: 'Research Scholar' },
      ];
      return res.status(StatusCodes.OK).json(pieData);
    } else if (mode === 'Year') {
      return res.status(StatusCodes.OK).json(yearArr);
    }
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).send('Something went wrong.');
  }
};

//Controller 10
const addPredefinedQues = async (req, res) => {
  const { ques, ans, eventId, faqId } = req.body;
  try {
    let event = await Event.findById(eventId, { belongsTo: 1, faq: 1 });
    const authorized = await isAuthorized(
      req.user.id,
      req.user.role,
      event.belongsTo
    );
    if (!ques || !ans || !authorized) {
      return res
        .status(StatusCodes.OK)
        .send('Either insufficient data or not authorized.');
    }
    const dataPoint = {
      id: Date.now().toString(36) + Math.random().toString(36).substring(2, 7),
      ques,
      ans,
      predefined: true,
    };
    event.faq = [dataPoint, ...event.faq];
    if (faqId) {
      for (let i = 0; i < event.faq.length; i++) {
        if (event.faq[i].id === faqId) {
          event.faq[i] = { ...event.faq[i], setAsPredefined: true };
        }
      }
    }
    event.save();
    return res.status(StatusCodes.OK).send('Faq updated successfully.');
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).send('Something went wrong.');
  }
};

//Controller 11
const removePredefinedQues = async (req, res) => {
  const { faqId, eventId, ques } = req.body;
  try {
    let event = await Event.findById(eventId, { belongsTo: 1, faq: 1 });
    const authorized = await isAuthorized(
      req.user.id,
      req.user.role,
      event.belongsTo
    );
    if (!faqId || !authorized) {
      return res
        .status(StatusCodes.OK)
        .send('Either insufficient data or not authorized.');
    }
    let foundIndex;
    for (let i = 0; i < event.faq.length; i++) {
      if (event.faq[i].id === faqId) {
        event.faq[i].setAsPredefined = false;
      }
      if (event.faq[i].ques === ques && !event.faq[i].id === faqId) {
        foundIndex = i;
      }
    }
    event.faq.splice(foundIndex, 1);
    event.save();
    return res
      .status(StatusCodes.OK)
      .send('Predefined question removed successfully.');
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).send('Something went wrong.');
  }
};

//Controller 12
const askQuestion = async (req, res) => {
  const { eventId, ques } = req.body;
  try {
    let event = await Event.findById(eventId, {
      faq: 1,
      eventManagerMail: 1,
      name: 1,
    });
    const user = await User.findById(req.user.id, {
      name: 1,
      image: 1,
      _id: 1,
      pushToken: 1,
    });
    const dataPoint = {
      id: Date.now().toString(36) + Math.random().toString(36).substring(2, 7),
      ques,
      seekerDetail: {
        name: user.name,
        image: user.image,
        id: user._id,
        pushToken: user.pushToken,
      },
      predefined: false,
    };
    event.faq.push(dataPoint);
    event.save();

    //scheduling a job for alerting event manager
    let threeSec = new Date(Date.now() + 1 * 3 * 1000);
    schedule.scheduleJob(
      `questionAsked_${new Date()}_${req.user.id}`,
      threeSec,
      async () => {
        //sending an email to the event manager
        const intro = [
          `We have received the following question on faq portal for ${event.name}. Could you kindly investigate and address this matter at your earliest convenience?`,
          ques,
        ];
        const outro =
          'This email contains confidential information. If you did not accept this email kindly ignore it.';
        const subject = `Question asked regarding ${event.name}`;
        const destination = [event.eventManagerMail];
        const name = 'Event Manager';
        const { ses, params } = await sendMail(
          name,
          intro,
          outro,
          subject,
          destination
        );
        await ses.sendEmail(params).promise();
      }
    );
    return res.status(StatusCodes.OK).json({ dataPoint });
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).send('Something went wrong.');
  }
};

//Controller 13
const answerTheQuestion = async (req, res) => {
  const { eventId, ans, faqId } = req.body;
  try {
    let event = await Event.findById(eventId);
    const authorized = await isAuthorized(
      req.user.id,
      req.user.role,
      event.belongsTo
    );
    if (!ans || !authorized) {
      return res
        .status(StatusCodes.OK)
        .send('Either insufficient data or not authorized.');
    }
    const user = await User.findById(req.user.id, {
      name: 1,
      image: 1,
      _id: 1,
      pushToken: 1,
    });
    let newDataCopy;
    let email = '';
    let name = '';
    let seeker = {
      email: '',
      name: '',
      pushToken: '',
      unreadNotice: [],
      image: '',
    };
    for (let i = 0; i < event.faq.length; i++) {
      if (event.faq[i].id === faqId) {
        const oldData = event.faq[i];
        const seekerId = oldData.seekerDetail.id;
        seeker = await User.findById(seekerId, {
          email: 1,
          name: 1,
          pushToken: 1,
          unreadNotice: 1,
          image: 1,
        });
        email = seeker.email;
        name = seeker.name;
        const newData = {
          ...oldData,
          ans,
          answererDetail: {
            name: user.name,
            image: user.image,
            pushToken: user.pushToken,
            position: 'Event Manager',
          },
        };
        newDataCopy = newData;
        event.faq[i] = newData;
        break;
      }
    }
    event.save();
    //in-app notice to user
    if (event.belongsTo.type === 'Club') {
      const params = {
        id: event.belongsTo.id,
        name: event.belongsTo.name,
        secondaryImg: event.belongsTo.img,
        deepNavigation: {
          action: 'eventFaq',
          params: {
            data: event,
          },
        },
      };
      const notice = {
        value: `You query regarding ${event.name} has been answered.`,
        img1: seeker.image,
        img2: event.url,
        key: 'event',
        action: 'club',
        params: params,
        time: new Date(),
        uid: `${new Date()}/${faqId}/${req.user.id}`,
      };
      seeker.unreadNotice = [notice, ...seeker.unreadNotice];
      seeker.save();
    }

    //scheduling a job for alerting the seeker
    let threeSec = new Date(Date.now() + 1 * 3 * 1000);
    schedule.scheduleJob(
      `answered_${new Date()}_${req.user.id}`,
      threeSec,
      async () => {
        //sending an email to the seeker
        const intro = [
          `The question you raised on faq portal for ${event.name} has been answered.Hope so it helps!`,
          `Thank you for contacting us.`,
        ];
        const outro =
          'This email contains confidential information. If you did not accept this email kindly ignore it.';
        const subject = `Answer posted regarding ${event.name}`;
        const destination = [email];
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
        //sending push notice to the seeker
        scheduleNotification(
          [seeker.pushToken],
          `Query regarding ${event.name}`,
          `Your question has been answered. Visit console now.`
        );
      }
    );

    return res.status(StatusCodes.OK).json({ dataPoint: newDataCopy });
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).send('Something went wrong.');
  }
};

//Controller 14
const getFaq = async (req, res) => {
  const { eventId } = req.query;
  try {
    let predefined = [];
    const event = await Event.findById(eventId, { faq: 1, belongsTo: 1 });
    let lastPredefinedIndex = event.faq.length;
    const authorized = await isAuthorized(
      req.user.id,
      req.user.role,
      event.belongsTo
    );
    for (let i = 0; i < event.faq.length; i++) {
      const faq = event.faq[i];
      if (faq.predefined) {
        predefined.push(faq);
      } else {
        lastPredefinedIndex = i - 1;
        break;
      }
    }
    const generalQuestion = event.faq.slice(
      lastPredefinedIndex + 1,
      event.faq.length
    );
    return res
      .status(StatusCodes.OK)
      .json({ predefined, generalQuestion, authorized });
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).send('Something went wrong.');
  }
};

//Controller 15
const changeStatusJob = async (req, res) => {
  if (req.user.role === 'admin') {
    let featuredEvents = await Event.find({ status: 'featured' });
    for (let i = 0; i < featuredEvents.length; i++) {
      let event = featuredEvents[i];
      const time = new Date();
      const expiryTime = new Date(event.eventDate);
      const diff = expiryTime - time;
      if (diff < 0) {
        event.status = 'past and unclear';
        event.save();
      }
    }
    const jobSchedule = '0 0 * * *';
    schedule.cancelJob('expireEvent');
    schedule.scheduleJob(`expireEvent`, jobSchedule, async () => {
      let featuredEvents = await Event.find({ status: 'featured' });
      for (let i = 0; i < featuredEvents.length; i++) {
        let event = featuredEvents[i];
        const time = new Date();
        const expiryTime = new Date(event.eventDate);
        const diff = expiryTime - time;
        if (diff < 0) {
          event.status = 'past and unclear';
          event.save();
        }
      }
    });
    return res
      .status(StatusCodes.OK)
      .send('All event status configured successfully.');
  }
};

//Controller 16
const getTickets = async (req, res) => {
  try {
    const featuredEvents = await Event.find(
      {
        status: 'featured',
        ticketAvailable: true,
      },
      {
        courseAnalytics: 0,
        cumulativeRevenue: 0,
        ticketSellingDays: 0,
        amtPaid: 0,
        amtPaidTo: 0,
        faq: 0,
      }
    );
    const expiredEvents = await Event.find(
      {
        status: 'past and unclear',
        ticketAvailable: true,
      },
      {
        courseAnalytics: 0,
        cumulativeRevenue: 0,
        ticketSellingDays: 0,
        amtPaid: 0,
        amtPaidTo: 0,
        faq: 0,
      }
    ).limit(2);
    return res.status(StatusCodes.OK).json({ featuredEvents, expiredEvents });
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).send('Something went wrong.');
  }
};

//Controller 17
const generateTicketListPdf = async (req, res) => {
  const doc = new PDFDocument();

  // Set content type to PDF
  res.setHeader('Content-Type', 'application/pdf');

  // Pipe the PDF content to the response
  doc.pipe(res);

  // Add content to the PDF
  doc
    .fontSize(24)
    .text('Dynamic PDF Generated with Node.js', { align: 'center' });
  doc.moveDown();
  doc.fontSize(16).text(`Name: Amartya Doe`);
  doc.fontSize(16).text(`Email: john.doe@example.com`);
  doc.fontSize(16).text(`Age: 30`);

  // Finalize the PDF
  doc.end();
};

//Controller 18
const getReviews = async (req, res) => {
  try {
    const { eventId, batch, batchSize } = req.query;
    let reviews = await Ticket.find(
      { eventId, reviewMsg: { $ne: null } },
      {
        reviewMsg: 1,
        reviewStars: 1,
        reviewUrls: 1,
        boughtBy: 1,
        reviewLiked: 1,
      }
    );
    reviews = reviews.slice((batch - 1) * batchSize, batch * batchSize);
    const len = reviews.length;
    let finalData = [];
    for (let i = 0; i < len; i++) {
      const userId = reviews[i].boughtBy;
      const userInfo = await User.findById(userId, {
        name: 1,
        reg: 1,
        image: 1,
        course: 1,
        pushToken: 1,
        interests: 1,
      });
      const obj = { ...reviews[i]._doc, userInfo };
      finalData.push(obj);
    }
    return res.status(StatusCodes.OK).json(finalData);
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).send('Something went wrong.');
  }
};

//Controller 19
const checkTicketAvailability = async (req, res) => {
  try {
    const { eventId } = req.query;
    const event = await Event.findById(eventId, {
      bookedBy: 1,
      ticketTypes: 1,
    });
    if (!event) {
      return res.status(StatusCodes.NOT_FOUND).send('Event not found.');
    }
    const ticketTypes = event.ticketTypes.map((ticket) => ticket.type.trim());
    const ticketCounts = await Ticket.aggregate([
      { $match: { _id: { $in: event.bookedBy } } },
      { $group: { _id: '$type', count: { $sum: 1 } } },
    ]);
    const ticketTypesSales = ticketTypes.reduce((acc, type) => {
      acc[type] = 0;
      return acc;
    }, {});
    ticketCounts.forEach(({ _id, count }) => {
      if (ticketTypesSales.hasOwnProperty(_id.trim())) {
        ticketTypesSales[_id.trim()] = count;
      }
    });
    return res.status(StatusCodes.OK).json(ticketTypesSales);
  } catch (error) {
    console.error(error.message);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send('Something went wrong.');
  }
};

//Controller 20
const checkLiveAttendance = async (req, res) => {
  try {
    const { eventId } = req.query;
    const event = await Event.findById(eventId, {
      bookedBy: 1,
      ticketTypes: 1,
    });
    let ticketTypesEntrance = event.ticketTypes.reduce((acc, ticket) => {
      if (ticket.type) {
        acc[ticket.type.trim()] = [];
      }
      return acc;
    }, {});
    const tickets = await Ticket.find(
      { _id: { $in: event.bookedBy }, status: 'redeemed' },
      { type: 1, boughtBy: 1 }
    );
    const userPromises = tickets.map((ticket) => {
      return User.findById(ticket.boughtBy, { name: 1, image: 1, reg: 1 })
        .then((userInfo) => {
          if (!userInfo) {
            console.warn(`User not found for ID: ${ticket.boughtBy}`);
          }
          return userInfo;
        })
        .catch((error) => {
          console.error(
            `Error fetching user with ID: ${ticket.boughtBy}`,
            error
          );
          return null;
        });
    });
    const users = await Promise.all(userPromises);
    tickets.forEach((ticket, index) => {
      const userInfo = users[index];
      if (ticketTypesEntrance[ticket.type.trim()]) {
        ticketTypesEntrance[ticket.type.trim()].push(userInfo);
      }
    });
    return res.status(StatusCodes.OK).json(ticketTypesEntrance);
  } catch (error) {
    console.log(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send('Something went wrong.');
  }
};

//Controller 21
const askForReviewSubmission = async (req, res) => {
  try {
    const { eventId } = req.query;
    const event = await Event.findById(eventId, {
      bookedBy: 1,
      name: 1,
      url: 1,
    });
    const notReviewedTicketsUserDetails = await Ticket.aggregate([
      {
        $match: {
          _id: { $in: event.bookedBy },
          reviewMsg: null,
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'boughtBy',
          foreignField: '_id',
          pipeline: [
            { $project: { _id: 1, email: 1, pushToken: 1, name: 1, image: 1 } },
          ],
          as: 'userDetails',
        },
      },
      {
        $project: {
          _id: 0,
          pushToken: { $arrayElemAt: ['$userDetails.pushToken', 0] },
          email: { $arrayElemAt: ['$userDetails.email', 0] },
          name: { $arrayElemAt: ['$userDetails.name', 0] },
          image: { $arrayElemAt: ['$userDetails.image', 0] },
          userId: { $arrayElemAt: ['$userDetails._id', 0] },
        },
      },
    ]);
    const userIds = notReviewedTicketsUserDetails.map((user) => user.userId);
    const notice = {
      value: `Share your experience at ${event.name} with us.`,
      img1: event.url,
      img2: event.url,
      key: 'event',
      action: 'yourTickets',
      params: {},
      time: new Date(),
      uid: `${new Date()}/${event.name}/${req.user.id}`,
    };
    await User.updateMany(
      { _id: { $in: userIds } },
      { $push: { unreadNotice: notice } }
    );

    // scheduling for pushing push notice and email
    let threeSec = new Date(Date.now() + 1 * 3 * 1000);
    schedule.scheduleJob(`review_${eventId}`, threeSec, async () => {
      for (let i = 0; i < notReviewedTicketsUserDetails.length; i++) {
        const detail = notReviewedTicketsUserDetails[i];
        scheduleNotification(
          [detail.pushToken],
          `Hi ${detail.name}`,
          `How was your experience at ${event.name}? Please review it on your tickets console.`
        );
        const intro = [
          `How was your experience at ${event.name}?`,
          `Please review it by visiting your tickets section.`,
        ];
        const outro = 'We will see you at the next event.';
        const subject = `Review event ${event.name}`;
        const destination = [detail.email];
        const name = `${detail.name}`;
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
      }
    });

    return res
      .status(StatusCodes.OK)
      .send('Notifications for event review dispatched.');
  } catch (error) {
    console.log(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send('Something went wrong.');
  }
};

const getAllTicketsBought = async (req, res) => {
  const { eventId, batch, batchSize } = req.query;
  console.log(req.query);
  const skip = (batch - 1) * parseInt(batchSize, 10);
  try {
    const [event] = await Event.aggregate([
      {
        $match: { _id: mongoose.Types.ObjectId(eventId) },
      },
      {
        $project: {
          bookedBy: { $slice: ['$bookedBy', skip, parseInt(batchSize, 10)] },
          _id: 0,
        },
      },
    ]);
    if (!event) {
      return res.status(StatusCodes.NOT_FOUND).send('Event not found.');
    }
    const tickets = await Ticket.aggregate([
      {
        $match: { _id: { $in: event.bookedBy } },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'boughtBy',
          foreignField: '_id',
          as: 'userMetaData',
        },
      },
      {
        $project: {
          _id: 1,
          boughtBy: 1,
          eventId: 1,
          paymentId: 1,
          amtPaid: 1,
          status: 1,
          generatedAt: 1,
          type: 1,
          userMetaData: {
            name: 1,
            course: 1,
            reg: 1,
            email: 1,
            pushToken: 1,
            image: 1,
          },
        },
      },
    ]);
    return res.status(StatusCodes.OK).json(tickets);
  } catch (error) {
    console.error('Error fetching tickets bought:', error.message);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send('Cannot fetch tickets bought.');
  }
};

const getEvents = async (req, res) => {
  const events = await Event.find(
    {},
    { _id: 1, name: 1, belongsTo: 1, url: 1 }
  );

  return res.status(StatusCodes.OK).json(events);
};

module.exports = {
  createEvent,
  deleteEvent,
  getAllEvents,
  changeEventStatus,
  addClubEvent,
  getTicketsBought,
  getEventAnalytics,
  getCustomAnalytics,
  addPredefinedQues,
  removePredefinedQues,
  askQuestion,
  answerTheQuestion,
  getFaq,
  changeStatusJob,
  getTickets,
  generateTicketListPdf,
  getReviews,
  checkTicketAvailability,
  checkLiveAttendance,
  askForReviewSubmission,
  getAllTicketsBought,
  getEvents,
};
