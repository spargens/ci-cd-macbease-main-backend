const { StatusCodes } = require('http-status-codes');
const User = require('../models/user');
const Community = require('../models/community');
const Club = require('../models/club');
require('dotenv').config();
const Mailgen = require('mailgen');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const AWS = require('aws-sdk');
const { sendMail } = require('../controllers/utils');
const { OpenAI } = require('openai');
const { default: mongoose } = require('mongoose');

//using this function a new user can join Macbease
//req configuration:
//we need to send four parameters in form of an object in the req.body
//eg- {"name":"Amartya","reg":12113246,"email":"amartyasingh1010@gmail.com","password":"Carpediem@408"}

const p1 = [
  {
    type: 'club',
    name: 'Coding Club',
    id: mongoose.Types.ObjectId('657b9303f18136e2f692398c'),
    secondaryImg: 'public/club/CodingPost3.jpg',
  },
  {
    type: 'community',
    name: 'Mamba Mentality ',
    id: mongoose.Types.ObjectId('66ed18fe0c4142316f4c43f7'),
    secondary: 'public/community/FriSep20202412:11:00GMT+0530img',
  },
  {
    type: 'club',
    name: 'Pawn Knight',
    id: mongoose.Types.ObjectId('657b97a8f18136e2f69239ab'),
    secondaryImg: 'public/club/chessClunCover.jpg',
  },
  {
    type: 'community',
    name: 'got-it!',
    id: mongoose.Types.ObjectId('657b9407f18136e2f69239a1'),
    secondary: 'public/club/SocialClubLogo.jpg',
  },
];
const p2 = [
  {
    type: 'club',
    name: 'Sheyn',
    id: mongoose.Types.ObjectId('65fbb7a60fa1132b8c9cc280'),
    secondaryImg: 'public/club/ThuMar21202409:59:22GMT+0530img',
  },
  {
    type: 'community',
    name: 'World Wizards',
    id: mongoose.Types.ObjectId('657ba2e9f18136e2f69239d4'),
    secondary: 'public/communities/wAlogo.jpeg',
  },
  {
    type: 'club',
    name: 'Department of Entrepreneurship ',
    id: mongoose.Types.ObjectId('66d29ec57657f2d4231cd22a'),
    secondaryImg: 'public/club/SatAug31202410:10:35GMT+0530img',
  },
  {
    type: 'community',
    name: 'Game devs',
    id: mongoose.Types.ObjectId('670a1d50884ee1bcc3bb12b0'),
    secondary: 'public/community/SatOct12202412:25:09GMT+0530img',
  },
];
const p3 = [
  {
    type: 'club',
    name: 'Coding Club',
    id: mongoose.Types.ObjectId('657b9303f18136e2f692398c'),
    secondaryImg: 'public/club/CodingPost3.jpg',
  },
  {
    type: 'community',
    name: 'got-it!',
    id: mongoose.Types.ObjectId('657b9407f18136e2f69239a1'),
    secondary: 'public/club/SocialClubLogo.jpg',
  },
  {
    type: 'club',
    name: '0x0CAFE',
    id: mongoose.Types.ObjectId('670eb50be40cd552e8ba386d'),
    secondaryImg: 'public/club/WedOct16202400:01:37GMT+0530img',
  },
  {
    type: 'community',
    name: 'World Wizards',
    id: mongoose.Types.ObjectId('657ba2e9f18136e2f69239d4'),
    secondary: 'public/communities/wAlogo.jpeg',
  },
];
const arr = [p1, p2, p3];

const securePassword = async (password) => {
  try {
    const hash = await bcrypt.hash(password, 10);
    return hash;
  } catch (error) {
    console.log(error);
  }
};

const registerUser = async (req, res) => {
  console.log('sign up fired');
  const {
    name,
    email,
    password,
    course,
    reg,
    interests,
    cards,
    image,
    field,
    passoutYear,
    level,
    incompleteProfile,
    profession,
  } = req.body;
  const existingUser = await User.findOne({ name, reg, email });
  if (existingUser) {
    return res
      .status(StatusCodes.OK)
      .send('Already a user with these credentials exist.');
  }
  let hashedPassword = await securePassword(password);
  let newData = {
    name,
    email,
    password: hashedPassword,
    course,
    reg,
    interests,
    cards,
    image,
    field,
    passoutYear,
    level,
    incompleteProfile,
    profession: profession || 'Student',
  };
  let user = await User.create({
    ...newData,
  });
  const refreshToken = user.createRefreshToken();
  user.refreshToken = refreshToken;
  const rand = Math.floor(Math.random() * 3);
  for (let j = 0; j < arr[rand].length; j++) {
    const shortcut = arr[rand][j];
    user.shortCuts.push(shortcut);
    if (shortcut.type === 'community') {
      const community = await Community.findById(shortcut.id, {
        pinnedBy: 1,
      });
      community.pinnedBy.push(mongoose.Types.ObjectId(user._id));
      await community.save();
    } else if (shortcut.type === 'club') {
      const club = await Club.findById(shortcut.id, { pinnedBy: 1 });
      club.pinnedBy.push(mongoose.Types.ObjectId(user._id));
      await club.save();
    }
  }
  const randomUser = await User.aggregate([
    { $sample: { size: 1 } },
    { $project: { name: 1, image: 1, pushToken: 1 } },
  ]);
  const personShortCut = {
    type: 'people',
    img: randomUser[0].image,
    name: randomUser[0].name,
    id: randomUser[0]._id,
    userPushToken: randomUser[0].pushToken,
  };
  const concernedUser = await User.findById(personShortCut.id, { pinnedBy: 1 });
  concernedUser.pinnedBy.push(mongoose.Types.ObjectId(user._id));
  await concernedUser.save();
  user.shortCuts.push(personShortCut);
  user.save();
  const AccessToken = user.createAccessToken();

  //sending an email on signup
  const intro = [
    'We are so delighted to have you onboard Macbease.',
    `We look forward to making your college experience a delightful one.`,
  ];
  const outro = 'Let us begin this journey together!';
  const subject = 'Macbease Confirmation';
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

  return res.status(StatusCodes.CREATED).json({
    user: {
      name: user.name,
      image: user.image,
      _id: user._id,
      role: user.role,
      reg: user.reg,
    },
    token: AccessToken,
    refreshToken,
  });
};

//using this function the user can log in to his account
//req configuration:
//send login credentials in req body,eg, {"email":"1234@gmail.com","password":"1234"}

const loginUser = async (req, res) => {
  console.log('login attempted');
  const { email, password } = req.body;
  let user = await User.findOne(
    { email },
    {
      password: 1,
      deactivated: 1,
      deactivationDate: 1,
      name: 1,
      image: 1,
      role: 1,
      reg: 1,
    }
  );
  if (!user) {
    return res.status(StatusCodes.OK).send('User does not exist.');
  }
  const isPasswordCorrect = await bcrypt.compare(password, user.password);
  if (!isPasswordCorrect) {
    return res.status(StatusCodes.OK).send('Wrong password.');
  }
  if (user.deactivated) {
    const deactivationDate = user.deactivationDate;
    const givenDate = new Date(deactivationDate);
    const currentDate = new Date();
    const timeDifference = currentDate - givenDate;
    const daysElapsed = Math.floor(timeDifference / (1000 * 60 * 60 * 24));
    if (daysElapsed > 29) {
      return res.status(StatusCodes.OK).send('User does not exist.');
    } else {
      return res.status(StatusCodes.OK).json({
        msg: 'Account is currently deactivated.',
        days: 29 - daysElapsed,
      });
    }
  }
  const refreshToken = user.createRefreshToken();
  user.refreshToken = refreshToken;
  user.save();
  const AccessToken = user.createAccessToken();
  return res.status(StatusCodes.OK).json({
    user: {
      name: user.name,
      image: user.image,
      _id: user._id,
      role: user.role,
      reg: user.reg,
    },
    token: AccessToken,
    refreshToken,
  });
};

//Create new Access token using refresh token
const regenerateAccessToken = async (req, res) => {
  const { refreshToken } = req.body;
  let id;
  try {
    const payload = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    id = payload.id;
  } catch (error) {
    console.log(error);
    return res
      .status(StatusCodes.MISDIRECTED_REQUEST)
      .send('Invalid refresh token...');
  }
  const user = await User.findById(id);
  if (!user) {
    return res
      .status(StatusCodes.MISDIRECTED_REQUEST)
      .send('Invalid refresh token...');
  }
  if (user.refreshToken !== refreshToken) {
    return res
      .status(StatusCodes.MISDIRECTED_REQUEST)
      .send('Invalid refresh token...');
  }

  const newRefreshToken = user.createRefreshToken();
  const newAccessToken = user.createAccessToken();

  user.refreshToken = newRefreshToken;
  user.save();

  return res.status(StatusCodes.OK).send({ newAccessToken, newRefreshToken });
};

//to send recovery otp via email
const recoveryEmail = async (req, res) => {
  const { userEmail, otp, name } = req.body;

  const intro = [
    'You have received this email because a password reset request for your account was received.',
    `The OTP is ${otp}`,
  ];
  const outro =
    'If you did not request a password reset, no further action is required on your part.';
  const subject = 'Password Recovery';
  const destination = [userEmail];
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
};

//function to check if the user exists. If it exists then setting a recoveryOtp and returning it
const setOtp = async (req, res) => {
  const { userEmail } = req.body;
  User.findOne({ email: userEmail }, (err, user) => {
    if (err) return console.error(err);
    if (!user) return res.status(StatusCodes.OK).send('User does not exists.');
    let otp = Math.floor(100000 + Math.random() * 900000);
    user.recoveryOtp = otp;
    user.save();
    return res.status(StatusCodes.OK).json(user.recoveryOtp);
  });
};

//function to set new password through email verification
const setNewPassword = async (req, res) => {
  let { otp, newPass, userEmail } = req.body;
  const user = await User.findOne({ userEmail });
  if (!user) return res.status(StatusCodes.OK).send('User does not exists.');
  let encryptedPassword = await securePassword(newPass);
  User.findOne({ email: userEmail }, (err, user) => {
    if (err) return console.error(err);
    let fixedOtp = user.recoveryOtp;
    if (fixedOtp === otp) {
      user.password = encryptedPassword;
    } else {
      return res.status(StatusCodes.OK).send('Verification failed.');
    }
    user.save();
    return res.status(StatusCodes.OK).json('Password changed successfully.');
  });
};

//function to set push token for notifications
const pushToken = async (req, res) => {
  const { userId, pushToken } = req.query;
  console.log('push token fired', userId, pushToken);
  User.findById(userId, (err, user) => {
    if (err) return console.error(err);
    user.pushToken = pushToken;
    user.save((err, update) => {
      if (err) return console.error(err);
      return res.status(StatusCodes.OK).send('Push token successfully saved!');
    });
  });
};

//function to check for availability of username
const userNameAvailable = async (req, res) => {
  const { userName, email, reg } = req.query;
  const nameExists = await User.findOne({ name: userName }, { _id: 1 });
  const emailExists = await User.findOne({ email: email }, { _id: 1 });
  const regExists = await User.findOne({ reg: parseInt(reg) }, { _id: 1 });
  if (nameExists) {
    return res.status(StatusCodes.OK).send('name exists');
  } else if (emailExists) {
    return res.status(StatusCodes.OK).send('email exists');
  } else if (regExists) {
    return res.status(StatusCodes.OK).send('reg exists');
  } else {
    return res.status(StatusCodes.OK).send('clear');
  }
};

//function to send email verification otp during sign up
const emailVerification = async (req, res) => {
  const { userEmail, name } = req.query;

  let otp = Math.floor(100000 + Math.random() * 900000);
  let intro = [
    'Greetings from Macbease.',
    'To verify your email please enter the following OTP.',
    `The OTP is ${otp}`,
  ];

  let outro =
    'If you did not expect any response from Macbease,then no further action is required from your part.Feel free to contact us at support@macbease.com.';

  let subject = 'Email Verification';

  const { ses, params } = await sendMail(
    name,
    intro,
    outro,
    subject,
    userEmail
  );
  ses.sendEmail(params, function (err, data) {
    if (err) {
      console.log(err, err.stack);
      return res.status(StatusCodes.OK).send('Something went wrong.');
    } else {
      return res
        .status(StatusCodes.OK)
        .json({ otp, msg: 'Email sent successfully.' });
    }
  });
};

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const generateAbout = async (req, res) => {
  const { word } = req.body;
  if (!word) {
    return res.status(400).json({ error: 'keyword is required' });
  }
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'user',
          content: `Generate an 'about' section for a user using the words: ${word}.Please do not include anything that has to be modified by the user.`,
        },
      ],
      max_tokens: 100,
    });

    const aboutSection = response.choices[0].message.content;
    res.json({ about: aboutSection });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ error: 'An error occurred while generating the about section' });
  }
};

const generateResearchAreas = async (req, res) => {
  const { word } = req.query;
  if (!word) {
    return res.status(400).json({ error: 'keyword is required' });
  }
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'user',
          content: `Generate an array of 30 research areas in ${word} field.`,
        },
      ],
    });
    const aboutSection = response.choices[0].message.content;
    const array = aboutSection
      .split('\n')
      .map((item) => item.replace(/^\d+\.\s*/, ''));
    res.json(array);
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ error: 'An error occurred while generating the about section' });
  }
};

// controller to generate interests from the words
const generateInterest = async (req, res) => {
  const { word } = req.body;
  if (!word) {
    return res.status(400).json({ error: 'keyword is required' });
  }
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'user',
          content: `Generate an array of similar words using the words : ${word}(might be multiple words or single word).Generate atleast 8 interests for each word. your response should be one dimensional array`,
        },
      ],
      max_tokens: 1000,
    });
    const interests = response.choices[0].message.content;
    const interestArray = JSON.parse(interests);
    res.json({ interestArray });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ error: 'An error occurred while generating interests' });
  }
};

const reactivateAccount = async (req, res) => {
  const { email, password } = req.body;
  try {
    let user = await User.findOne({ email });
    if (!user) {
      return res.status(StatusCodes.OK).send('User does not exist.');
    }
    const isPasswordCorrect = await bcrypt.compare(password, user.password);
    if (!isPasswordCorrect) {
      return res.status(StatusCodes.OK).send('Wrong password.');
    }
    user.deactivated = false;
    user.save();
    return res.status(StatusCodes.OK).send('Reactivation successful.');
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ error: 'An error occurred while reactivating account.' });
  }
};

module.exports = {
  registerUser,
  loginUser,
  recoveryEmail,
  setOtp,
  setNewPassword,
  pushToken,
  userNameAvailable,
  emailVerification,
  regenerateAccessToken,
  generateAbout,
  generateResearchAreas,
  generateInterest,
  reactivateAccount,
};
