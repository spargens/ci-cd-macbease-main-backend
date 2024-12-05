const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const userSchema = new mongoose.Schema({
  profession: {
    type: String,
    enum: ['Student', 'Professor'],
    default: 'Student',
  },
  incompleteProfile: {
    type: Boolean,
    default: false,
  },
  role: {
    type: String,
    default: 'Normal',
  },
  name: {
    type: String,
    required: [true, 'Please provide the user name.'],
  },
  reg: {
    type: Number,
    required: [true, 'Please provide the registration number.'],
  },
  course: {
    type: String,
  },
  field: {
    type: String,
  },
  passoutYear: {
    type: String,
  },
  level: {
    type: String,
  },
  email: {
    type: String,
    required: [true, 'Please provide the email id.'],
    match: [
      /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/,
      'Please provide a valid email',
    ],
  },
  password: {
    type: String,
    required: [true, 'Please provide the password.'],
  },
  image: {
    type: String,
    default: 'xyz.com',
  },
  phone: {
    type: Number,
  },
  dob: {
    type: Date,
    default: 1 - 1 - 2000,
  },
  cart: {
    type: Array,
  },
  reviewHistory: {
    type: Array,
  },
  cards: {
    type: Array,
  },
  chatRooms: {
    type: Array,
  },
  credibilityScore: {
    type: Number,
    default: 5,
  },
  //propOrder {id:"P-1",otp:8183,name:"Projector",time:"Night Shift",status:"Received"(enum["Yet to be dispatched","Dispatched"]),remark:"",logId:"",date:"",reviewed:false}
  propOrder: {
    type: Array,
  },
  giftsSend: {
    type: Array,
  },
  giftsReceived: {
    type: Array,
  },
  notifications: {
    type: Array,
  },
  unreadNotice: {
    type: Array,
  },
  //clubs you are part of...[{clubId}]
  clubs: {
    type: Array,
  },
  //blocked user from sending gifts ["user_id","user_id"]
  blockList: {
    type: Array,
  },
  likedCards: {
    type: Array,
  },
  //[{communityId}]
  communitiesCreated: {
    type: Array,
  },
  //[{communityId,bestStreak,currentStreak,lastPosted,totalLikes,totalPosts,rating}]
  communitiesPartOf: {
    type: Array,
  },
  //[{communityId,contentId}]
  communityContribution: {
    type: Array,
  },
  //[contentId]
  clubContributions: {
    type: Array,
  },
  //[{contentId,type:enum["community","club","gift","Macbease"]}]
  likedContents: {
    type: Array,
  },
  taggedContents: {
    type: Array,
  },
  //[{contentId,type:enum["community","club","gift","Macbease"],comment}]
  commentedContents: {
    type: Array,
  },
  //["Ai and Ml","Universe","Movies"]
  interests: {
    type: Array,
  },
  lastActive: {
    type: String,
  },
  recoveryOtp: {
    type: Number,
  },
  pushToken: {
    type: String,
  },
  //["id"]
  feed: {
    type: Array,
  },
  eventFeed: {
    type: Array,
  },
  //["id"]
  macbeaseContentContribution: {
    type: Array,
  },
  shortCuts: {
    type: Array,
  },
  ticketsBought: {
    type: Array,
  },
  refreshToken: { type: String },
  cardFeed: {
    type: Array,
  },
  badges: {
    type: Array,
  },
  deactivated: {
    type: Boolean,
    default: false,
  },
  deactivationDate: {
    type: Date,
  },
  pinnedBy: {
    type: Array,
  },
  tunedIn_By: {
    type: Array,
  },
  hasTunedTo: {
    type: Array,
  },
  creatorPost: {
    type: String,
  },
  resources: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Resource',
    },
  ],
});

userSchema.methods.createAccessToken = function () {
  return jwt.sign(
    { role: 'user', id: this._id },
    process.env.ACCESS_TOKEN_SECRET,
    {
      expiresIn: 60 * 25,
    }
  );
};

userSchema.methods.createRefreshToken = function () {
  return jwt.sign(
    { role: 'user', id: this._id },
    process.env.REFRESH_TOKEN_SECRET,
    {
      expiresIn: process.env.REFRESH_TOKEN_LIFETIME,
    }
  );
};

module.exports = mongoose.model('User', userSchema);
