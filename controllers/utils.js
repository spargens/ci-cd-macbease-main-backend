const Mailgen = require('mailgen');
const AWS = require('aws-sdk');

const { getMessaging } = require('firebase-admin/messaging');
const schedule = require('node-schedule');

const moment = require('moment-timezone');

const User = require('../models/user');
const Admin = require('../models/admin');
const { updateOne } = require('../models/content');

function getCurrentISTDate() {
  const istDate = moment().tz('Asia/Kolkata');
  return istDate.format('YYYY-MM-DD HH:mm:ss');
}

const sendMail = async (name, intro, outro, subject, destination, action) => {
  //generating mail design
  var mailGenerator = new Mailgen({
    theme: 'cerberus',
    product: {
      name: 'Macbease Team',
      link: 'https://macbease.com/',
      logo: 'https://mailgen.js/img/logo.png',
    },
  });
  // Prepare email contents
  var email = {
    body: {
      name: name,
      intro,
      outro,
      action,
    },
  };

  if (!Array.isArray(destination)) {
    destination = [destination];
  }
  // Generate an HTML email with the provided contents
  var emailBody = mailGenerator.generate(email);
  var params = {
    Source: 'support@macbease.com',
    Destination: {
      ToAddresses: [destination[0]],
    },
    Message: {
      Subject: {
        Data: subject,
      },
      Body: {
        Html: {
          Data: emailBody,
        },
      },
    },
  };
  AWS.config.update({
    region: process.env.AWS_REGION, // e.g., 'us-east-1'
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  });
  var ses = new AWS.SES();
  return { ses, params };
};

const scheduleNotification = (pushToken, title, body, image) => {
  if (!title || !body || !pushToken) {
    console.log('Title,body or push token missing!');
    return;
  }
  let threeSec = new Date(Date.now() + 1 * 3 * 1000);
  schedule.scheduleJob(`notification_${pushToken}`, threeSec, () => {
    pushToken.forEach((token) => {
      if (token === 'undefined' || !token.length > 80) {
        return;
      }
      const message = {
        notification: {
          title: title,
          body: body,
        },
        android: {
          notification: {
            imageUrl: image,
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              'mutable-content': 1,
            },
          },
          fcm_options: {
            image: image,
          },
        },

        token: token,
      };

      getMessaging()
        .send(message)
        .then((response) => {
          console.log('Successfully sent message:', response);
        })
        .catch((error) => {
          console.log('Error sending message:', error);
        });
    });
  });
};

const scheduleNotification2 = ({ pushToken, title, body, image, url }) => {
  if (!title || !body || !pushToken) {
    console.log('Title,body or push token missing!');
    return;
  }
  let threeSec = new Date(Date.now() + 1 * 3 * 1000);
  schedule.scheduleJob(`notification_${pushToken}`, threeSec, () => {
    pushToken.forEach((token) => {
      if (token === 'undefined' || !token.length > 80) {
        return;
      }
      const message = {
        notification: {
          title: title,
          body: body,
        },
        android: {
          notification: {
            imageUrl: image,
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              'mutable-content': 1,
            },
          },
          fcm_options: {
            image: image,
          },
        },
        data: {
          url: url,
        },
        token: token,
      };

      getMessaging()
        .send(message)
        .then((response) => {
          console.log('Successfully sent message:', response);
        })
        .catch((error) => {
          console.log('Error sending message:', error);
        });
    });
  });
};

const updateDynamicIsland = async (ids, id, metaDataKey, increase) => {
  try {
    const users = await User.find({ _id: { $in: ids } }, { shortCuts: 1 });
    const bulkOps = users.map((user) => {
      const updatedShortcuts = user.shortCuts.map((item) => {
        if (item.id.toString() === id) {
          const obj = { ...item };
          if (!obj.metaData) {
            if (item.type === 'club') {
              obj.metaData = { posts: 0, messages: 0, notifications: 0 };
            } else if (item.type === 'community') {
              obj.metaData = { posts: 0, notifications: 0 };
            } else if (item.type === 'people') {
              obj.metaData = { messages: 0 };
            }
          }
          if (increase) {
            obj.metaData[metaDataKey] = (obj.metaData[metaDataKey] || 0) + 1;
          } else {
            obj.metaData[metaDataKey] = 0;
          }
          return obj;
        }
        return item;
      });
      return {
        updateOne: {
          filter: { _id: user._id },
          update: { $set: { shortCuts: updatedShortcuts } },
        },
      };
    });
    if (bulkOps.length > 0) {
      await User.bulkWrite(bulkOps);
    }
    console.log('Successfully populated dynamic island~');
  } catch (error) {
    console.log(error);
  }
};

const URLa = 'https://d5e1vvp3vh274.cloudfront.net/';
const bucket = 's3userdata25136-dev';
const generateUri = async (url) => {
  const UriRequest = JSON.stringify({
    bucket,
    key: url,
    edits: {
      resize: {
        width: 500,
        height: 500,
      },
    },
  });
  const encoded = Buffer.from(UriRequest).toString('base64');
  return URLa + encoded;
};

const pingAdmins = async ({ role, ids, pingLevel, notification, email }) => {
  try {
    const targetAdmins = role
      ? await Admin.find(
          { role },
          { _id: 1, email: 1, pushToken: 1, unreadNotice: 1 }
        )
      : await Admin.aggregate([
          { $match: { _id: { $in: ids } } },
          { $project: { _id: 1, email: 1, pushToken: 1, unreadNotice: 1 } },
        ]);
    const targetPushTokens = targetAdmins
      .map((item) => item.pushToken)
      .filter((token) => token);
    if (notification?.title && notification?.body) {
      const notificationPayload = {
        pushToken: targetPushTokens,
        title: notification.title,
        body: notification.body,
        ...(notification.url && { url: notification.url }),
      };
      // notification.url
      //   ? scheduleNotification2(notificationPayload)
      //   : scheduleNotification(
      //       notificationPayload.pushToken,
      //       notificationPayload.title,
      //       notificationPayload.body
      //     );
    }
    if (pingLevel === 1 || pingLevel === 2) {
      const notice = {
        value: notification.body,
        img1: notification?.img1,
        img2: notification?.img2,
        key: notification?.key,
        action: notification?.action,
        params: notification?.params,
        time: new Date(),
        uid: `${new Date().toISOString()}`,
      };
      const updateOps = targetAdmins.map((admin) => ({
        updateOne: {
          filter: { _id: admin._id },
          update: {
            $push: { unreadNotice: { $each: [notice], $position: 0 } },
          },
        },
      }));
      await Admin.bulkWrite(updateOps);
    }
    if (pingLevel === 2) {
      const targetMailIds = targetAdmins.map((item) => item.email);
      if (targetMailIds.length > 0) {
        const { ses, params } = await sendMail(
          `${role ? role : 'Macbease Admin'}`,
          email.intro,
          email.outro,
          email.subject,
          targetMailIds
        );
        ses.sendEmail(params, function (err, data) {
          if (err) {
            console.log(err, err.stack);
          }
        });
      }
    }
  } catch (error) {
    console.log(error);
  }
};

module.exports = {
  sendMail,
  getCurrentISTDate,
  scheduleNotification,
  scheduleNotification2,
  updateDynamicIsland,
  generateUri,
  pingAdmins,
};
