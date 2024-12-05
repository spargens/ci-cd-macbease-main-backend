const { StatusCodes } = require('http-status-codes');
const Community = require('../models/community');
const Admin = require('../models/admin');
const User = require('../models/user');
const Content = require('../models/content');
const Club = require('../models/club');
const Bag = require('../models/bag');
const Card = require('../models/card');
const schedule = require('node-schedule');
const { mongoose } = require('mongoose');
const io = require('../app');
const {
  scheduleNotification,
  updateDynamicIsland,
  scheduleNotification2,
  generateUri,
} = require('./utils');

//Controller 1
const createCommunity = async (req, res) => {
  if (req.user.role === 'admin' || req.user.role === 'user') {
    const { title, cover, secondaryCover, label, tag } = req.body;
    let creatorId = req.user.id;
    let creatorPos = req.user.role;
    let createdOn = new Date();
    let members = [req.user.id];
    let finalData = {
      title,
      cover,
      secondaryCover,
      label,
      creatorId,
      creatorPos,
      createdOn,
      tag,
      members,
    };
    Community.create({ ...finalData }, (err, community) => {
      if (err) return console.error(err);
      User.findById(req.user.id, (err, user) => {
        if (err) return console.error(err);
        let data = { communityId: community._id };
        const shortCut = {
          type: 'community',
          id: community._id,
          name: title,
          secondary: secondaryCover,
          native: true,
          metaData: { posts: 0 },
        };
        let shortCuts = user.shortCuts;
        user.shortCuts = [];
        user.shortCuts = [shortCut, ...shortCuts];
        user.communitiesCreated.push(data);
        user.communitiesPartOf.push({
          communityId: community._id.toString(),
          bestStreak: 0,
          currentStreak: 0,
          lastPosted: new Date(),
          totalLikes: 0,
          totalPosts: 0,
          rating: 0,
          joined: new Date(),
        });
        let notification = {
          key: 'community',
          value: 'You have successfully created a community.',
          data: community._id,
        };
        user.notifications.push(notification);
        user.save((err, update) => {
          if (err) return console.error(err);
          return res.status(StatusCodes.OK).json(community);
        });
      });
    });
  } else {
    return res
      .status(StatusCodes.OK)
      .send('You are not authorized to create a new community.');
  }
};

//Controller 2
const deleteCommunity = async (req, res) => {
  if (req.user.role === 'admin') {
    const { id } = req.body;
    const community = await Community.findByIdAndDelete(id);
    if (community) {
      return res.status(StatusCodes.OK).json({ deletedCommunity: community });
    } else {
      return res
        .status(StatusCodes.OK)
        .send('Unable to find the community and delete it.');
    }
  } else {
    return res
      .status(StatusCodes.OK)
      .send('You are not authorized to delete a community.');
  }
};

//Controller 3
const joinAsMember = async (req, res) => {
  if (req.user.role === 'admin' || req.user.role === 'user') {
    const { communityId } = req.body;
    Community.findById(communityId, (err, community) => {
      if (err) return console.error(err);
      if (community.members.includes(mongoose.Types.ObjectId(req.user.id))) {
        return res.status(StatusCodes.OK).send('You are already a memeber.');
      }
      community.members.push(mongoose.Types.ObjectId(req.user.id));
      community.activeMembers = community.activeMembers + 1;
      if (req.user.role === 'user') {
        User.findById(req.user.id, (err, user) => {
          if (err) return console.error(err);
          user.communitiesPartOf.push({
            communityId,
            bestStreak: 0,
            currentStreak: 0,
            lastPosted: new Date(),
            totalLikes: 0,
            totalPosts: 0,
            rating: 0,
            joined: new Date(),
          });
          user.notifications.push({
            key: 'community',
            value: 'You have joined the community.',
            data: communityId,
          });
          user.save();
        });
      }

      community.save((err, update) => {
        if (err) return console.error(err);
        return res
          .status(StatusCodes.OK)
          .send('You have successfully joined the community.');
      });
    });
  } else {
    return res
      .status(StatusCodes.OK)
      .send('You are not authorized to join the community.');
  }
};

//Controller 4
const leaveAsMember = async (req, res) => {
  if (req.user.role === 'user' || req.user.role === 'admin') {
    const { communityId } = req.body;
    Community.findById(communityId, (err, community) => {
      if (err) return console.error(err);
      let members = community.members;
      members = members.filter((item) => item.toString() !== req.user.id);
      community.members = [];
      community.members.push(...members);
      community.activeMembers = community.activeMembers - 1;
      if (req.user.role === 'user') {
        User.findById(req.user.id, (err, user) => {
          if (err) return console.error(err);
          let communities = user.communitiesPartOf;
          communities = communities.filter(
            (item) => item.communityId !== communityId
          );
          user.communitiesPartOf = [];
          user.communitiesPartOf.push(...communities);
          user.notifications.push({
            key: 'community',
            value: 'You have successfully left the community.',
            data: communityId,
          });
          user.save();
        });
      }
      community.save((err, update) => {
        if (err) return console.error(err);
        return res
          .status(StatusCodes.OK)
          .send('You have successfully left the community.');
      });
    });
  } else {
    return res
      .status(StatusCodes.OK)
      .send('You are not authorized to leave the community.');
  }
};

//Controller 5
//this upload content is outdated and is replaced by controller 29
const uploadContent = async (req, res) => {
  if (req.user.role === 'user' || req.user.role === 'admin') {
    const { contentId, communityId } = req.body;
    let content = await Content.findById(contentId);

    //scheduling job for updating feed
    let threeSec = new Date(Date.now() + 1 * 3 * 1000);
    schedule.scheduleJob(
      `feedCommunity_${req.user.id}_${new Date()}`,
      threeSec,
      async () => {
        let members = await Community.findById(communityId, {
          members: 1,
          _id: 0,
        });
        members = members.members;
        let len = members.length;
        //reproduce actual content to be pushed in the user's feed
        if (content) {
          content = content._doc;
          let point = {
            _id: content._id,
          };
          //we can't push a notice for every community content
          // const notice = {
          //   value: `${community.title} posted a pin.`,
          //   img1: community.secondaryCover,
          //   img2: content.url,
          //   contentType: content.contentType,
          //   key: 'content',
          //   action: 'community',
          //   params: {
          //     name: community.title,
          //     secondary: community.secondaryCover,
          //     id: communityId,
          //   },
          // };
          for (let i = 0; i < len; i++) {
            let userId = members[i];
            User.findById(userId, (err, user) => {
              if (err) return console.error(err);
              let feed = user.feed;
              let notices = user.unreadNotice;
              feed = [point, ...feed];
              user.unreadNotice = [];
              user.feed = [];
              user.feed = feed;
              user.unreadNotice = notices;
              user.save();
            });
          }
        }
      }
    );

    Community.findById(communityId, (err, community) => {
      if (err) return console.error(err);

      let isMember = false;
      community.members.map((item) => {
        if (item === req.user.id) isMember = true;
      });
      if (isMember) {
        community.content.push({
          contentId,
          irrelevanceVote: 0,
          flagSaturated: false,
          flaggedBy: [],
          timeStamp: new Date(),
          type: content.contentType,
        });
        if (req.user.role === 'user') {
          User.findById(req.user.id, (err, user) => {
            if (err) return console.error(err);
            user.communityContribution.push({ contentId, communityId });
            user.save();
          });
        }
        if (req.user.role === 'admin') {
          Admin.findById(req.user.id, (err, admin) => {
            if (err) return console.error(err);
            admin.communityContribution.push({ contentId, communityId });
            admin.save();
          });
        }
        community.save((err, update) => {
          if (err) return console.error(err);
          return res.status(StatusCodes.OK).send('Successfully posted.');
        });
      } else {
        return res
          .status(StatusCodes.OK)
          .send('You have to first become the member of the community.');
      }
    });
  } else {
    return res
      .status(StatusCodes.OK)
      .send('You are not authorized to post anything on this community.');
  }
};

//Controller 6
const deleteContent = async (req, res) => {
  if (req.user.role === 'user' || req.user.role === 'admin') {
    const { contentId, communityId } = req.body;
    let isEligible = false;
    let content = await Content.findById(contentId);
    if (req.user.role === 'admin' || content.idOfSender === req.user.id)
      isEligible = true;
    if (isEligible) {
      Community.findById(communityId, (err, community) => {
        if (err) return console.error(err);
        let contents = community.content;
        contents = contents.filter((item) => item.contentId !== contentId);
        community.content = [];
        community.content.push(...contents);
        if (req.user.role === 'user') {
          User.findById(req.user.id, (err, user) => {
            if (err) return console.error(err);
            let contribution = user.communityContribution;
            contribution = contribution.filter((item) => {
              item.contentId !== contentId;
            });
            user.communityContribution = [];
            user.communityContribution.push(...contribution);
            user.save();
          });
        }
        if (req.user.role === 'admin') {
          Admin.findById(req.user.id, (err, admin) => {
            if (err) return console.error(err);
            let contribution = admin.communityContribution;
            contribution = contribution.filter(
              (item) => item.contentId !== contentId
            );
            admin.communityContribution = [];
            admin.communityContribution.push(...contribution);
            admin.save();
          });
        }
        community.save((err, update) => {
          if (err) return console.error(err);
          return res.status(StatusCodes.OK).send('Successfully deleted.');
        });
      });
    } else {
      return res
        .status(StatusCodes.OK)
        .send(
          'You are not authorized to delete this content as you are neither creator nor the admin.'
        );
    }
  }
};

//Controller 7
const flag = async (req, res) => {
  if (req.user.role === 'user' || req.user.role === 'admin') {
    const { contentId, communityId } = req.body;
    const flaggedContent = await Content.findById(contentId);
    const senderId = flaggedContent.idOfSender;
    Community.findById(communityId, (err, community) => {
      if (err) return console.error(err);
      let isMember = false;
      community.members.map((item) => {
        if (item === req.user.id) isMember = true;
      });
      let alreadyFlagged = false;
      let content;
      community.content.map((item) => {
        if (item.contentId === contentId) content = item;
      });
      content.flaggedBy.map((item) => {
        if (item === req.user.id) {
          alreadyFlagged = true;
        }
      });
      if (alreadyFlagged) {
        return res
          .status(StatusCodes.OK)
          .send('You have already flagged this content.');
      } else if (isMember || req.user.role === 'admin') {
        let contents = community.content;
        contents = contents.filter((item) => item.contentId !== contentId);
        let vote = content.irrelevanceVote + 1;
        let flagSaturated = false;
        if (vote > 7) {
          flagSaturated = true;
          User.findById(community.creatorId, (err, user) => {
            if (err) return console.error(err);
            user.notifications.push({
              key: 'communityUrgent',
              value: 'Flag is saturated.',
              data: { communityId, contentId },
            });
            user.save();
          });
          User.findById(senderId, (err, user) => {
            if (err) return console.error(err);
            user.notifications.push({
              key: 'communityUrgent',
              value: 'Flag is saturated.',
              data: { communityId, contentId },
            });
            user.save();
          });
        }
        let modifiedContent = {
          contentId: content.contentId,
          irrelevanceVote: vote,
          flagSaturated: flagSaturated,
          flaggedBy: [...content.flaggedBy, req.user.id],
          timeStamp: content.timeStamp,
        };
        contents.push(modifiedContent);
        community.content = [];
        community.content.push(...contents);
        community.save();
        if (req.user.role === 'user') {
          User.findById(req.user.id, (err, user) => {
            if (err) return console.error(err);
            user.notifications.push({
              key: 'community',
              value: 'You have flagged a content.',
              data: { contentId, communityId },
            });
            user.save((err, update) => {
              if (err) return console.error(err);
              return res
                .status(StatusCodes.OK)
                .send('Successfully flagged the content.');
            });
          });
        }
        if (req.user.role === 'admin') {
          return res
            .status(StatusCodes.OK)
            .send('Successfully flagged the content.');
        }
      } else {
        return res
          .status(StatusCodes.OK)
          .send(
            'You have to be either the member of the community or an admin to flag the content.'
          );
      }
    });
  } else {
    return res
      .status(StatusCodes.OK)
      .send('You are not authorized to flag a content.');
  }
};

//Controller 8
const takeDown = async (req, res) => {
  if (req.user.role === 'admin' || req.user.role === 'user') {
    const { contentId, communityId } = req.body;
    let content = await Content.findById(contentId);
    let senderId = content.idOfSender;
    let sendBy = content.sendBy;

    //scheduling clean up
    let threeSec = new Date(Date.now() + 1 * 3 * 1000);
    schedule.scheduleJob(
      `cleanTakenDown_${req.user.id}_${new Date()}`,
      threeSec,
      async () => {
        let members = await Community.findById(communityId, {
          members: 1,
          _id: 0,
        });
        members = members.members;
        let len = members.length;
        for (let i = 0; i < len; i++) {
          let userId = members[i];
          User.findById(userId, (err, user) => {
            if (err) return console.error(err);
            let feed = user.feed;
            feed = feed.filter((item) => item !== contentId);
            user.feed = [];
            user.feed = feed;
            user.save();
          });
        }
      }
    );

    Community.findById(communityId, (err, community) => {
      if (err) return console.error(err);
      if (community.creatorId === req.user.id || req.user.role === 'admin') {
        let contents = community.content;
        contents = contents.filter((item) => item.contentId !== contentId);
        community.content = [];
        community.content.push(...contents);
        if (sendBy === 'userCommunity') {
          User.findById(senderId, (err, user) => {
            if (err) return console.error(err);
            let contribution = user.communityContribution;
            contribution = contribution.filter(
              (item) => item.contentId !== contentId
            );
            user.communityContribution = [];
            user.communityContribution.push(...contribution);
            user.notifications.push({
              key: 'community',
              value: 'Your content has been taken down',
              data: { communityId },
            });
            user.save();
          });
        } else {
          Admin.findById(senderId, (err, admin) => {
            if (err) return console.error(err);
            let contribution = admin.communityContribution;
            contribution = contribution.filter(
              (item) => item.contentId !== contentId
            );
            admin.communityContribution = [];
            admin.communityContribution.push(...contribution);
            admin.save();
          });
        }
        community.save((err, update) => {
          if (err) return console.error(err);
          return res
            .status(StatusCodes.OK)
            .send('The content has been successfully taken down.');
        });
      } else {
        return res
          .status(StatusCodes.OK)
          .send('You are neither community admin nor Macbease admin.');
      }
    });
  } else {
    return res
      .status(StatusCodes.OK)
      .send('You are not authorized to take down the community content.');
  }
};

//Controller 9
const updateStreak = async (req, res) => {
  if (req.user.role === 'user' || req.user.role === 'admin') {
    const { communityId } = req.body;
    if (req.user.role === 'user') {
      User.findById(req.user.id, (err, user) => {
        if (err) return console.error(err);
        let communitiesPartOf = user.communitiesPartOf;
        let dataToBeChanged = communitiesPartOf.filter(
          (item) => item.communityId === communityId
        );
        let restOfData = communitiesPartOf.filter(
          (item) => item.communityId !== communityId
        );
        dataToBeChanged = dataToBeChanged[0];
        let lastPosted = dataToBeChanged.lastPosted;
        let today = new Date();
        const _MS_PER_DAY = 1000 * 60 * 60 * 24;
        const utc1 = Date.UTC(
          lastPosted.getFullYear(),
          lastPosted.getMonth(),
          lastPosted.getDate()
        );
        const utc2 = Date.UTC(
          today.getFullYear(),
          today.getMonth(),
          today.getDate()
        );
        const diff = Math.floor((utc2 - utc1) / _MS_PER_DAY);
        if (diff === 1) {
          dataToBeChanged.currentStreak = dataToBeChanged.currentStreak + 1;
          if (dataToBeChanged.currentStreak > dataToBeChanged.bestStreak) {
            dataToBeChanged.bestStreak = dataToBeChanged.currentStreak;
          }
        } else if (diff > 1) {
          if (dataToBeChanged.currentStreak > dataToBeChanged.bestStreak) {
            dataToBeChanged.bestStreak = dataToBeChanged.currentStreak;
          }
          dataToBeChanged.currentStreak = 1;
        }
        dataToBeChanged.lastPosted = new Date();
        restOfData.push(dataToBeChanged);
        communitiesPartOf = restOfData;
        user.communitiesPartOf = [];
        user.communitiesPartOf.push(...communitiesPartOf);
        user.save((err, update) => {
          if (err) return console.error(err);
          return res.status(StatusCodes.OK).send('Streak updated');
        });
      });
    } else {
      Admin.findById(req.user.id, (err, user) => {
        if (err) return console.error(err);
        let communitiesPartOf = user.communitiesPartOf;
        let dataToBeChanged = communitiesPartOf.filter(
          (item) => item.communityId === communityId
        );
        let restOfData = communitiesPartOf.filter(
          (item) => item.communityId !== communityId
        );
        dataToBeChanged = dataToBeChanged[0];
        let lastPosted = dataToBeChanged.lastPosted;
        let today = new Date();
        const _MS_PER_DAY = 1000 * 60 * 60 * 24;
        const utc1 = Date.UTC(
          lastPosted.getFullYear(),
          lastPosted.getMonth(),
          lastPosted.getDate()
        );
        const utc2 = Date.UTC(
          today.getFullYear(),
          today.getMonth(),
          today.getDate()
        );
        const diff = Math.floor((utc2 - utc1) / _MS_PER_DAY);
        if (diff === 1) {
          dataToBeChanged.currentStreak = dataToBeChanged.currentStreak + 1;
          if (dataToBeChanged.currentStreak > dataToBeChanged.bestStreak) {
            dataToBeChanged.bestStreak = dataToBeChanged.currentStreak;
          }
        } else if (diff > 1) {
          if (dataToBeChanged.currentStreak > dataToBeChanged.bestStreak) {
            dataToBeChanged.bestStreak = dataToBeChanged.currentStreak;
          }
          dataToBeChanged.currentStreak = 1;
        }
        dataToBeChanged.lastPosted = new Date();
        restOfData.push(dataToBeChanged);
        communitiesPartOf = restOfData;
        user.communitiesPartOf = [];
        user.communitiesPartOf.push(...communitiesPartOf);
        user.save((err, update) => {
          if (err) return console.error(err);
          return res.status(StatusCodes.OK).send('Streak updated');
        });
      });
    }
  } else {
    return res
      .status(StatusCodes.OK)
      .send('You are not authorized to update streak.');
  }
};

//Controller 10
const likesAndPosts = async (req, res) => {
  if (req.user.role === 'user' || req.user.role === 'admin') {
    const { communityId } = req.body;
    if (req.user.role) {
      User.findById(req.user.id, (err, user) => {
        if (err) return console.error(err);
        let communityContribution = user.communityContribution;
        let likes = 0;
        let posts = 0;
        communityContribution.map((item) => {
          if (item.communityId === communityId) {
            posts = posts + 1;
          }
        });
        let communitiesPartOf = user.communitiesPartOf;
        let dataToBeChanged = communitiesPartOf.filter(
          (item) => item.communityId === communityId
        );
        let restOfData = communitiesPartOf.filter(
          (item) => item.communityId !== communityId
        );
        dataToBeChanged = dataToBeChanged[0];
        dataToBeChanged.totalLikes = likes;
        dataToBeChanged.totalPosts = posts;
        restOfData.push(dataToBeChanged);
        communitiesPartOf = restOfData;
        user.communitiesPartOf = [];
        user.communitiesPartOf.push(...communitiesPartOf);
        user.save((err, update) => {
          if (err) return console.error(err);
          return res.status(StatusCodes.OK).send('Likes and posts updated');
        });
      });
    } else {
      Admin.findById(req.user.id, (err, user) => {
        if (err) return console.error(err);
        let communityContribution = user.communityContribution;
        let likes = 0;
        let posts = 0;
        communityContribution.map((item) => {
          if (item.communityId) {
            posts = posts + 1;
          }
        });
        let communitiesPartOf = user.communitiesPartOf;
        let dataToBeChanged = communitiesPartOf.filter(
          (item) => item.communityId === communityId
        );
        let restOfData = communitiesPartOf.filter(
          (item) => item.communityId !== communityId
        );
        dataToBeChanged = dataToBeChanged[0];
        dataToBeChanged.totalLikes = likes;
        dataToBeChanged.totalPosts = posts;
        restOfData.push(dataToBeChanged);
        communitiesPartOf = restOfData;
        user.communitiesPartOf = [];
        user.communitiesPartOf.push(...communitiesPartOf);
        user.save((err, update) => {
          if (err) return console.error(err);
          return res.status(StatusCodes.OK).send('Likes and posts updated');
        });
      });
    }
  } else {
    return res
      .status(StatusCodes.OK)
      .send('You are not authorized to update number of likes and posts.');
  }
};

//Controller 11
const rating = async (req, res) => {
  if (req.user.role === 'user' || req.user.role === 'admin') {
    const { communityId } = req.body;
    if (req.user.role === 'user') {
      User.findById(req.user.id, (err, user) => {
        if (err) return console.error(err);
        let communitiesPartOf = user.communitiesPartOf;
        let dataToBeChanged = communitiesPartOf.filter(
          (item) => item.communityId === communityId
        );
        let restOfData = communitiesPartOf.filter(
          (item) => item.communityId !== communityId
        );
        dataToBeChanged = dataToBeChanged[0];
        let bestStreak = dataToBeChanged.bestStreak;
        let currentStreak = dataToBeChanged.currentStreak;
        let totalPosts = dataToBeChanged.totalPosts;
        let rating = Math.floor(
          totalPosts * 13.6 + bestStreak * 1.4 + currentStreak * 1.7
        );
        dataToBeChanged.rating = rating;
        restOfData.push(dataToBeChanged);
        communitiesPartOf = restOfData;
        user.communitiesPartOf = [];
        user.communitiesPartOf.push(...communitiesPartOf);
        user.save((err, update) => {
          if (err) return console.error(err);
          return res.status(StatusCodes.OK).send('Rating updated.');
        });
      });
    } else {
      Admin.findById(req.user.id, (err, user) => {
        if (err) return console.error(err);
        let communitiesPartOf = user.communitiesPartOf;
        let dataToBeChanged = communitiesPartOf.filter(
          (item) => item.communityId === communityId
        );
        let restOfData = communitiesPartOf.filter(
          (item) => item.communityId !== communityId
        );
        dataToBeChanged = dataToBeChanged[0];
        let bestStreak = dataToBeChanged.bestStreak;
        let currentStreak = dataToBeChanged.currentStreak;
        let totalPosts = dataToBeChanged.totalPosts;
        let rating = Math.floor(
          totalPosts * 13.6 + bestStreak * 1.4 + currentStreak * 1.7
        );
        dataToBeChanged.rating = rating;
        restOfData.push(dataToBeChanged);
        communitiesPartOf = restOfData;
        user.communitiesPartOf = [];
        user.communitiesPartOf.push(...communitiesPartOf);
        user.save((err, update) => {
          if (err) return console.error(err);
          return res.status(StatusCodes.OK).send('Rating updated.');
        });
      });
    }
  } else {
    return res
      .status(StatusCodes.OK)
      .send('You are not authorized to update the rating.');
  }
};

//Controller 12
const getAllCommunities = async (req, res) => {
  const community = await Community.find(
    {},
    { secondaryCover: 1, label: 1, activeMembers: 1, title: 1, tag: 1 }
  );
  return res.status(StatusCodes.OK).json(community);
};

//Controller 13
const getCommunityById = async (req, res) => {
  const { communityId } = req.query;
  const community = await Community.findById(communityId);
  if (community) {
    return res.status(StatusCodes.OK).json(community);
  } else {
    return res.status(StatusCodes.OK).send('Community not found.');
  }
};

//Controller 14
const getCommunityByTag = async (req, res) => {
  const { tag } = req.query;
  const communities = await Community.find(
    { tag: new RegExp(tag, 'i', 'g') },
    { secondaryCover: 1, title: 1, tag: 1, activeMembers: 1, label: 1 }
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
  return res.status(StatusCodes.OK).json(communities);
};

//Controller 15
const isMember = async (req, res) => {
  const { communityId } = req.query;
  if (req.user.role === 'user') {
    User.findById(req.user.id, (err, user) => {
      if (err) return console.error(err);
      let communitiesPartOf = user.communitiesPartOf;
      communitiesPartOf = communitiesPartOf.filter(
        (item) => item.communityId === communityId
      );
      if (communitiesPartOf.length !== 0) {
        return res.status(StatusCodes.OK).send('You are member.');
      } else {
        return res.status(StatusCodes.OK).send('You are not a member.');
      }
    });
  } else if (req.user.role === 'admin') {
    Admin.findById(req.user.id, (err, admin) => {
      if (err) return console.error(err);
      let communitiesPartOf = admin.communitiesPartOf;
      communitiesPartOf = communitiesPartOf.filter(
        (item) => item.communityId === communityId
      );
      if (communitiesPartOf.length !== 0) {
        return res.status(StatusCodes.OK).send('You are member.');
      } else {
        return res.status(StatusCodes.OK).send('You are not a member.');
      }
    });
  }
};

//Controller 16
const getContentOfACommunity = async (req, res) => {
  const { communityId } = req.query;
  const community = await Community.findById(communityId);
  const contents = community.content;
  return res.status(StatusCodes.OK).json(contents);
};

//Controller 17
const getCommunitiesPartOf = async (req, res) => {
  if (req.user.role === 'user') {
    const user = await User.findById(req.user.id, {
      communitiesPartOf: 1,
      _id: 0,
      clubs: 1,
    });
    let communities = user.communitiesPartOf;
    let len = communities.length;
    let finalDataCommunity = [];
    for (let i = 0; i < len; i++) {
      let point = communities[i];
      let id = point.communityId;
      let community = await Community.findById(id, {
        secondaryCover: 1,
        title: 1,
        tag: 1,
        activeMembers: 1,
        _id: 0,
      });
      community = community._doc;
      point = { ...point, ...community };
      finalDataCommunity.push(point);
    }
    let clubs = user.clubs;
    let len2 = clubs.length;
    let finalDataClub = [];
    for (let j = 0; j < len2; j++) {
      let point = clubs[j];
      let id = point.clubId;
      let club = await Club.findById(id, {
        _id: 0,
        name: 1,
        secondaryImg: 1,
        motto: 1,
        tags: 1,
      });
      club = club._doc;
      point = { ...point, ...club };
      finalDataClub.push(point);
    }
    let finalData = { finalDataCommunity, finalDataClub };
    return res.status(StatusCodes.OK).json(finalData);
  } else if (req.user.role === 'admin') {
    const user = await Admin.findById(req.user.id, {
      communitiesPartOf: 1,
      _id: 0,
    });
    return res.status(StatusCodes.OK).json(user);
  }
};

//Controller 18
const getLatestContent = async (req, res) => {
  const { communityId } = req.query;
  if (req.user.role === 'user') {
    const user = await User.findById(req.user.id);
    let lastActive = user.lastActive;
    lastActive = new Date(lastActive);
    let arr = [];
    Community.findById(communityId, (err, community) => {
      if (err) return console.error(err);
      let contents = community.content;
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
    Community.findById(communityId, (err, community) => {
      if (err) return console.error(err);
      let contents = community.content;
      for (let i = 0; i < contents.length; i++) {
        let content = contents[i];
        if (lastActive - new Date(content.timeStamp) < 0) arr.push(content);
      }
      return res.status(StatusCodes.OK).json(arr);
    });
  }
};

//Controller 19
const getCommunityProfile = async (req, res) => {
  const { communityId } = req.query;
  const community = await Community.findById(communityId, {
    title: 1,
    secondaryCover: 1,
    _id: 0,
    cover: 1,
    label: 1,
    tag: 1,
  });
  return res.status(StatusCodes.OK).json(community);
};

//Controller 20
const getUserProfile = async (req, res) => {
  const { userId } = req.query;
  if (req.user.role === 'user') {
    let user = await User.findById(userId, {
      image: 1,
      name: 1,
      _id: 0,
      pushToken: 1,
      deactivated: 1,
    });
    return res.status(StatusCodes.OK).json(user);
  } else if (req.user.role === 'admin') {
    let user = await Admin.findById(userId, { image: 1, name: 1, _id: 0 });
    return res.status(StatusCodes.OK).json(user);
  }
};

//Controller 21
const getLikeAndFlagStatus = async (req, res) => {
  if (req.user.role === 'admin' || req.user.role === 'user') {
    const { contentId, communityId } = req.query;
    const content = await Content.findById(contentId, { likes: 1, _id: 0 });
    let liked = content.likes.includes(req.user.id);
    const communityData = await Community.findById(communityId, {
      content: 1,
      _id: 0,
    });
    let concernedData = communityData.content.find(
      (item) => item.contentId === contentId
    );
    let flaggedBy = concernedData.flaggedBy;
    let flagged = flaggedBy.includes(req.user.id);
    return res.status(StatusCodes.OK).json({ liked, flagged });
  } else {
    return res
      .status(StatusCodes.OK)
      .send('You are not authorized to get the like and flag status. ');
  }
};

//Controller 22
const getBasicCommunityDataFromId = async (req, res) => {
  const { communityId } = req.query;
  const community = await Community.findById(communityId, {
    secondaryCover: 1,
    title: 1,
    tag: 1,
    activeMembers: 1,
  });
  return res.status(StatusCodes.OK).json(community);
};

//Controller 23
const getUserContributionCover = async (req, res) => {
  const { communityId } = req.query;
  if (req.user.role === 'user') {
    let partOf = await User.findById(req.user.id, {
      communitiesPartOf: 1,
      _id: 0,
      name: 1,
      image: 1,
    });
    let user = partOf.communitiesPartOf.find(
      (item) => item.communityId === communityId
    );
    return res
      .status(StatusCodes.OK)
      .json({ user, name: partOf.name, image: partOf.image });
  } else if (req.user.role === 'admin') {
    let partOf = await Admin.findById(req.user.id, {
      communitiesPartOf: 1,
      _id: 0,
      name: 1,
      image: 1,
    });
    let user = partOf.communitiesPartOf.find(
      (item) => item.communityId === communityId
    );
    return res
      .status(StatusCodes.OK)
      .json({ user, name: partOf.name, image: partOf.image });
  }
};

//Controller 24
const getContribution = async (req, res) => {
  const { communityId, batch } = req.query;
  if (req.user.role === 'user') {
    const user = await User.findById(req.user.id, {
      communityContribution: 1,
      _id: 0,
    });
    let communityContribution = user.communityContribution;
    if (batch) {
      communityContribution = communityContribution.slice(
        (batch - 1) * 50,
        batch * 50
      );
    }
    let relevantIds = [];
    communityContribution.map((item, index) => {
      if (item.communityId === communityId) {
        relevantIds.push(mongoose.Types.ObjectId(item.contentId));
      }
    });
    const contents = await Content.aggregate([
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
    ]);
    return res.status(StatusCodes.OK).json(contents);
  }
};

//Controller 25
const getAllTags = async (req, res) => {
  const communities = await Community.find({}, { tag: 1, _id: 0 });
  return res.status(StatusCodes.OK).json(communities);
};

//Controller 26
const getLikedPosts = async (req, res) => {
  let user = await User.findById(req.user.id, { likedContents: 1, _id: 0 });
  user = user.likedContents;
  let data = [];
  for (let i = 0; i < user.length; i++) {
    let likedContent = user[i];
    if (likedContent.type === 'community') {
      data.push(likedContent.contentId);
    }
  }
  return res.status(StatusCodes.OK).json(data);
};

//Controller 27
const getFastFeed = async (req, res) => {
  if (req.user.role === 'user') {
    const user = await User.findById(req.user.id, {
      communitiesPartOf: 1,
      lastActive: 1,
      _id: 0,
    });
    let communities = user.communitiesPartOf;
    let lastActive = user.lastActive;
    lastActive = new Date(lastActive);
    let len = communities.length;
    let totalContent = [];
    for (let i = 0; i < len; i++) {
      let communityId = communities[i].communityId;
      let contents = await Community.findById(communityId, {
        content: 1,
        _id: 0,
      });
      contents = contents.content;
      totalContent.push(...contents);
    }
    // let finalContent = [];
    // for (let j = 0; j < totalContent.length; j++) {
    //     let content = totalContent[j];
    //     if (lastActive - new Date(content.timeStamp) < 0) {
    //         finalContent.push(content)
    //     }
    // }
    let finalContent = totalContent;
    let actualContent = [];
    for (let k = 0; k < finalContent.length; k++) {
      let contentId = finalContent[k].contentId;
      let irrelevanceVote = finalContent[k].irrelevanceVote;
      let actualData = await Content.findById(contentId);
      actualData = actualData._doc;
      let data = { irrelevanceVote, ...actualData };
      actualContent.push(data);
    }
    let finishedContent = [];
    for (let l = 0; l < actualContent.length; l++) {
      let data = actualContent[l];
      let userId = data.idOfSender;
      let communityId = data.belongsTo;
      let user = await User.findById(userId, { image: 1, name: 1, _id: 0 });
      let community = await Community.findById(communityId, {
        title: 1,
        secondaryCover: 1,
        _id: 0,
      });
      let withPicData = {
        ...data,
        userName: user.name,
        userPic: user.image,
        communityTitle: community.title,
        communityCover: community.secondaryCover,
      };
      finishedContent.push(withPicData);
    }

    return res.status(StatusCodes.OK).json({ finishedContent, lastActive });
  }
};

//Controller 28
const getFastNativeFeed = async (req, res) => {
  if (req.user.role === 'user' || req.user.role === 'admin') {
    const { communityId } = req.query;
    try {
      const community = await Community.findById(communityId, {
        content: 1,
        label: 1,
        createdOn: 1,
        activeMembers: 1,
        creatorId: 1,
        cover: 1,
        members: 1,
        onlineMembers: 1,
      });
      if (!community) {
        return res.status(StatusCodes.NOT_FOUND).send('Community not found');
      }
      const [creatorDetail, contents, userDetail] = await Promise.all([
        User.findById(community.creatorId, {
          name: 1,
          image: 1,
          pushToken: 1,
        }),
        Promise.resolve(community.content.slice(0, 6)),
        User.findById(req.user.id, {
          name: 1,
          image: 1,
          pushToken: 1,
        }),
      ]);
      if (
        !community.onlineMembers.includes(mongoose.Types.ObjectId(req.user.id))
      ) {
        community.onlineMembers.push(mongoose.Types.ObjectId(req.user.id));
        await community.save();
        io.emit(`communityOnlineStatusUpdated_${communityId}`, {
          status: 1,
          metaData: userDetail,
        });
      }
      const isMember = community.members.includes(req.user.id);
      const isCreator = community.creatorId.toString() === req.user.id;
      const contentIds = contents.map((contentItem) => contentItem.contentId);
      const actualContentDocs = await Content.find({
        _id: { $in: contentIds },
      });
      const actualContent = actualContentDocs.map((contentDoc) => {
        const matchedContent = contents.find(
          (c) => c.contentId === contentDoc._id.toString()
        );
        const doc = contentDoc._doc;

        return {
          ...doc,
          irrelevanceVote: matchedContent.irrelevanceVote,
          commentsNum: doc.comments.length,
          comments: doc.comments.slice(0, 6),
        };
      });
      const communityDetail = {
        createdOn: community.createdOn,
        label: community.label,
        members: community.activeMembers,
        cover: community.cover,
      };
      return res.status(StatusCodes.OK).json({
        finishedContent: actualContent.reverse(),
        creatorDetail,
        communityDetail,
        isMember,
        isCreator,
        onlineMembers: community.onlineMembers.length,
      });
    } catch (error) {
      console.error(error);
      return res
        .status(StatusCodes.INTERNAL_SERVER_ERROR)
        .send('Something went wrong!');
    }
  }
};

const getBatchedContent = async (req, res) => {
  const { communityId, batch, batchSize, remedy } = req.query;
  try {
    const community = await Community.findById(communityId, { content: 1 });
    let content = [];
    let finalContent = [];
    if (batch && batchSize) {
      content = community.content.slice(
        (batch - 1) * batchSize,
        batch * batchSize
      );
      if (remedy) {
        content = content.slice(remedy);
      }
    } else {
      content = community.content;
    }
    const len = content.length;
    for (let i = 0; i < len; i++) {
      const id = content[i].contentId;
      let doc = await Content.findById(id);
      if (doc) {
        doc = doc._doc;
        let commentsNum = doc.comments.length;
        doc.comments = doc.comments.slice(0, 6);
        let point = {
          ...doc,
          irrelevanceVote: content[i].irrelevanceVote,
          commentsNum,
        };
        finalContent.push(point);
      }
    }
    return res.status(StatusCodes.OK).json({ finalContent });
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).send('Something went wrong!');
  }
};

//Controller 29
const post = async (req, res) => {
  const { contentId, communityId, contentType, actionHandled } = req.body;
  try {
    if (!contentId) {
      return res.status(StatusCodes.NOT_FOUND).send('Content id missing.');
    }
    const community = await Community.findById(communityId, {
      content: 1,
      members: 1,
    });
    if (!community) {
      return res.status(StatusCodes.NOT_FOUND).send('Community not found');
    }
    const isMember = community.members.includes(req.user.id);
    if (!isMember) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .send('You must join the community first.');
    }
    if (!contentType) {
      const content = await Content.findById(contentId, { contentType: 1 });
      community.content.unshift({
        contentId,
        irrelevanceVote: 0,
        flagSaturated: false,
        flaggedBy: [],
        timeStamp: new Date(),
        type: content.contentType,
      });
    } else {
      community.content.unshift({
        contentId,
        irrelevanceVote: 0,
        flagSaturated: false,
        flaggedBy: [],
        timeStamp: new Date(),
        type: contentType,
      });
    }

    const threeSec = new Date(Date.now() + 5 * 1000);
    schedule.scheduleJob(
      `feedCommunity_${req.user.id}_${threeSec}`,
      threeSec,
      async () => {
        const community = await Community.findById(communityId, {
          members: 1,
          muted: 1,
          seeLessFeed: 1,
          title: 1,
          pinnedBy: 1,
          secondaryCover: 1,
        });
        if (!community) {
          return console.error('Community not found');
        }
        await updateDynamicIsland(
          community.pinnedBy,
          communityId,
          'posts',
          true
        );
        let { members } = community;
        let memebersForPushToken = members;
        memebersForPushToken = memebersForPushToken.filter(
          (item, index) => !community.muted.includes(item.toString())
        );
        const users = await User.find(
          { _id: { $in: memebersForPushToken } },
          { pushToken: 1 }
        );
        const tokens = users.map((item) => item.pushToken);
        if (contentType === 'text') {
          members = members.filter(
            (item, index) => !community.seeLessFeed.includes(item.toString())
          );
        }
        const point = { _id: mongoose.Types.ObjectId(contentId) };
        if (contentType !== 'text') {
          await User.updateMany(
            { _id: { $in: members } },
            {
              $push: { feed: { $each: [point], $position: 0 } },
            }
          );
        }
        const contentMetaData = await Content.findById(contentId, {
          url: 1,
          text: 1,
          contentType: 1,
        });
        const user = await User.findById(req.user.id, {
          communityContribution: 1,
          communitiesPartOf: 1,
          name: 1,
        });
        user.communityContribution.push({ contentId, communityId });
        if (actionHandled) {
          if (contentMetaData.contentType === 'image') {
            const img = await generateUri(contentMetaData.url.split('@')[0]);
            scheduleNotification2({
              pushToken: tokens,
              title: `${user.name} posted in ${community.title}`,
              body: `${contentMetaData.text.substring(0, 50)}...`,
              image: img,
              url: `https://macbease-website.vercel.app/app/community/${community._id}/${community.title}/${community.secondaryCover}`,
            });
          } else {
            scheduleNotification2({
              pushToken: tokens,
              title: `${user.name} posted in ${community.title}`,
              body: `${contentMetaData.text.substring(0, 50)}...`,
              url: `https://macbease-website.vercel.app/app/community/${community._id}/${community.title}/${community.secondaryCover}`,
            });
          }
        } else {
          if (contentMetaData.contentType === 'image') {
            const img = await generateUri(contentMetaData.url.split('@')[0]);
            scheduleNotification(
              tokens,
              `${user.name} posted in ${community.title}`,
              `${contentMetaData.text.substring(0, 50)}...`,
              img
            );
          } else {
            scheduleNotification(
              tokens,
              `${user.name} posted in ${community.title}`,
              `${contentMetaData.text.substring(0, 50)}...`
            );
          }
        }
        //logic for updating streak
        let communitiesPartOf = user.communitiesPartOf;
        let dataToBeChanged = communitiesPartOf.filter(
          (item) => item.communityId === communityId
        );
        let restOfData = communitiesPartOf.filter(
          (item) => item.communityId !== communityId
        );
        dataToBeChanged = dataToBeChanged[0];
        let lastPosted = dataToBeChanged.lastPosted;
        let today = new Date();
        const _MS_PER_DAY = 1000 * 60 * 60 * 24;
        const utc1 = Date.UTC(
          lastPosted.getFullYear(),
          lastPosted.getMonth(),
          lastPosted.getDate()
        );
        const utc2 = Date.UTC(
          today.getFullYear(),
          today.getMonth(),
          today.getDate()
        );
        const diff = Math.floor((utc2 - utc1) / _MS_PER_DAY);
        if (diff === 1) {
          dataToBeChanged.currentStreak = dataToBeChanged.currentStreak + 1;
          if (dataToBeChanged.currentStreak > dataToBeChanged.bestStreak) {
            dataToBeChanged.bestStreak = dataToBeChanged.currentStreak;
          }
        } else if (diff > 1) {
          if (dataToBeChanged.currentStreak > dataToBeChanged.bestStreak) {
            dataToBeChanged.bestStreak = dataToBeChanged.currentStreak;
          }
          dataToBeChanged.currentStreak = 1;
        } else if (
          dataToBeChanged.currentStreak === 0 &&
          dataToBeChanged.bestStreak === 0
        ) {
          dataToBeChanged.currentStreak === 1;
          if (dataToBeChanged.currentStreak > dataToBeChanged.bestStreak) {
            dataToBeChanged.bestStreak = dataToBeChanged.currentStreak;
          }
        }
        dataToBeChanged.lastPosted = new Date();
        dataToBeChanged.totalPosts = dataToBeChanged.totalPosts + 1;
        let bestStreak = dataToBeChanged.bestStreak;
        let currentStreak = dataToBeChanged.currentStreak;
        let totalPosts = dataToBeChanged.totalPosts;
        let rating = Math.floor(
          totalPosts * 13.6 + bestStreak * 1.4 + currentStreak * 1.7
        );
        dataToBeChanged.rating = rating;
        restOfData.push(dataToBeChanged);
        communitiesPartOf = restOfData;
        user.communitiesPartOf = [];
        user.communitiesPartOf.push(...communitiesPartOf);
        user.save();
      }
    );
    await community.save();
    const contentDoc = await Content.findById(contentId);
    const finalObj = { ...contentDoc._doc, irrelevanceVote: 0, commentsNum: 0 };
    io.emit(`communityContentUpdated_${communityId}`, {
      communityId,
      content: finalObj,
    });
    return res.status(StatusCodes.OK).send('Successfully posted.');
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send('An error occurred while posting community pin.');
  }
};

//Controller 30
const editCommunityProfile = async (req, res) => {
  const { communityId, data } = req.body;
  await Community.findByIdAndUpdate(communityId, { ...data });
  return res.status(StatusCodes.OK).send('Successfully updated!');
};

//Controller 31
const getAllContributionOfUser = async (req, res) => {
  const { id, batch, batchSize } = req.query;
  const skip = (batch - 1) * batchSize;
  try {
    const user = await User.findById(id, {
      communityContribution: 1,
    }).lean();
    if (!user || !user.communityContribution) {
      return res.status(StatusCodes.OK).json([]);
    }
    const reversedContributions = user.communityContribution.reverse();
    const contributionsBatch = reversedContributions.slice(
      skip,
      skip + parseInt(batchSize)
    );
    const relevantIds = contributionsBatch.map((item) =>
      mongoose.Types.ObjectId(item.contentId)
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

//Controller 32
const getAllMembers = async (req, res) => {
  try {
    const { id } = req.query;

    const communityWithMembers = await Community.aggregate([
      { $match: { _id: mongoose.Types.ObjectId(id) } },
      { $unwind: '$members' },
      {
        $lookup: {
          from: 'users',
          localField: 'members',
          foreignField: '_id',
          as: 'memberDetails',
        },
      },
      { $unwind: '$memberDetails' },
      {
        $project: {
          _id: '$memberDetails._id',
          name: '$memberDetails.name',
          image: '$memberDetails.image',
          course: '$memberDetails.course',
          reg: '$memberDetails.reg',
          pushToken: '$memberDetails.pushToken',
        },
      },
    ]);
    if (!communityWithMembers.length) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .send('Community not found or no members');
    }
    return res.status(StatusCodes.OK).json(communityWithMembers);
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send('Something went wrong');
  }
};

//Controller 33
const getAllRelatedSocialGroups = async (req, res) => {
  try {
    const { query } = req.query;
    const bags = await Bag.aggregate([
      {
        $search: {
          index: 'default',
          text: {
            query: query,
            path: 'keyWords',
            fuzzy: {},
          },
        },
      },
    ]);
    const finalData = bags.reduce((acc, bag) => acc.concat(bag.keyWords), []);
    if (finalData.length === 0) {
      finalData.push(query);
    }
    const [communities, clubs] = await Promise.all([
      Community.aggregate([
        {
          $match: {
            $or: [
              { tag: { $in: finalData } },
              { title: { $regex: new RegExp(`^${query}$`, 'i') } },
            ],
          },
        },
        {
          $project: {
            secondaryCover: 1,
            title: 1,
            tag: 1,
            activeMembers: 1,
            label: 1,
          },
        },
      ]),
      Club.aggregate([
        {
          $match: {
            $or: [
              { tags: { $in: finalData } },
              { name: { $regex: new RegExp(`^${query}$`, 'i') } },
            ],
          },
        },
        {
          $project: {
            secondaryImg: 1,
            name: 1,
            tags: 1,
            motto: 1,
            rating: 1,
          },
        },
      ]),
    ]);
    const cards = await Card.aggregate([
      {
        $match: {
          tags: { $in: finalData },
        },
      },
      {
        $project: {
          value: 1,
          creator: 1,
          tags: 1,
          likedBy: 1,
          time: 1,
          userMetaData: 1,
        },
      },
    ]);
    return res.status(StatusCodes.OK).json({ clubs, communities, cards });
  } catch (error) {
    console.error('Error fetching social groups:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send('Failed to retrieve social groups.');
  }
};

//Controller 34
const getOthersContributionCover = async (req, res) => {
  try {
    const { userId, communityId } = req.query;
    const user = await User.findById(userId, {
      passoutYear: 1,
      communitiesPartOf: 1,
      _id: 0,
    });
    const communities = user.communitiesPartOf;
    const len = communities.length;
    let dataPoint = { points: '', contributions: '', joining: '' };
    let commArr = [];
    for (let i = 0; i < len; i++) {
      const commId = communities[i].communityId;
      if (commId === communityId) {
        dataPoint.points = communities[i].rating;
        dataPoint.contributions = communities[i].totalPosts;
        dataPoint.joining = communities[i].joined;
      } else {
        const comm = await Community.findById(commId, { cover: 1, title: 1 });
        const obj = {
          title: comm.title,
          secondaryCover: comm.cover,
          _id: commId,
        };
        commArr.push(obj);
      }
    }
    return res.status(StatusCodes.OK).json({
      passoutYear: user.passoutYear,
      stats: dataPoint,
      partOf: commArr,
    });
  } catch (error) {
    console.log(error.message);
    return res.status(StatusCodes.OK).send('Something went wrong.');
  }
};

function formatDateToMonthYear(dateString) {
  const date = new Date(dateString);
  const options = { year: 'numeric', month: 'short' };
  return date.toLocaleString('en-US', options);
}

const getMediaAndDocs = async (req, res) => {
  const { communityId, key, processedPins, lastProcessedTimeStamp } = req.query;
  try {
    const commData = await Community.findById(communityId, { content: 1 });
    let contents = commData.content;
    if (processedPins) {
      contents = contents.slice(processedPins);
    }
    const keys = key.split('%');
    let i = 0;
    let numMonths = -1;
    let month = null;
    let arr = [];
    while (i < contents.length) {
      const contentId = contents[i].contentId;
      if (
        keys.includes(contents[i].type) &&
        new Date(contents[i].timeStamp) < new Date(lastProcessedTimeStamp)
      ) {
        const thisMonth = formatDateToMonthYear(contents[i].timeStamp);
        if (thisMonth !== month) {
          numMonths = numMonths + 1;
          month = thisMonth;
        }
        if (numMonths < 2) {
          if (arr[numMonths]) {
            arr[numMonths] = [
              ...arr[numMonths],
              mongoose.Types.ObjectId(contentId),
            ];
          } else {
            arr[numMonths] = [mongoose.Types.ObjectId(contentId)];
          }
        } else {
          break;
        }
      }
      i = i + 1;
    }
    let finalData = [];
    for (let j = 0; j < arr.length; j++) {
      const relevantContent = await Content.find(
        { _id: { $in: arr[j] } },
        { url: 1, timeStamp: 1, metaData: 1, params: 1, contentType: 1 }
      );
      finalData[j] = relevantContent;
    }

    return res
      .status(StatusCodes.OK)
      .json({ processedPins: i, data: finalData });
  } catch (error) {
    console.log(error.message);
    return res.status(StatusCodes.OK).send('Something went wrong.');
  }
};

const gotOffline = async (req, res) => {
  try {
    const { communityId } = req.query;
    await Community.updateOne(
      { _id: communityId },
      { $pull: { onlineMembers: mongoose.Types.ObjectId(req.user.id) } }
    );
    const userDetail = await User.findById(req.user.id, {
      name: 1,
      image: 1,
      pushToken: 1,
      shortCuts: 1,
    });
    const shortcuts = userDetail.shortCuts;
    const foundIndex = shortcuts.findIndex(
      (item) => item.id.toString() === communityId
    );
    if (foundIndex !== -1) {
      shortcuts[foundIndex].metaData = shortcuts[foundIndex].metaData || {};
      shortcuts[foundIndex].metaData.posts = 0;
      userDetail.markModified('shortCuts');
      await userDetail.save();
    }
    io.emit(`communityOnlineStatusUpdated_${communityId}`, {
      status: 0,
      metaData: userDetail,
    });
    return res.status(StatusCodes.OK).send('Marked Offline!');
  } catch (error) {
    console.log(error.message);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send('Something went wrong.');
  }
};

const addToConstraintList = async (req, res) => {
  try {
    const { communityId, field } = req.body;
    if (field === 'muted') {
      await Community.findByIdAndUpdate(communityId, {
        $addToSet: { muted: req.user.id },
      });
    } else if (field === 'seeLessFeed') {
      await Community.findByIdAndUpdate(communityId, {
        $addToSet: { seeLessFeed: req.user.id },
      });
    }
    return res
      .status(StatusCodes.OK)
      .send(`Added successfully to ${field} list.`);
  } catch (error) {
    console.error(error.message);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send('Something went wrong.');
  }
};

const removeFromConstraintList = async (req, res) => {
  try {
    const { communityId, field } = req.body;
    if (field === 'muted') {
      await Community.updateOne(
        { _id: communityId },
        { $pull: { muted: req.user.id } }
      );
    } else if (field === 'seeLessFeed') {
      await Community.updateOne(
        { _id: communityId },
        { $pull: { seeLessFeed: req.user.id } }
      );
    }
    return res
      .status(StatusCodes.OK)
      .send(`Removed successfully from ${field} list.`);
  } catch (error) {
    console.error(error.message);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send('Something went wrong.');
  }
};

const getConstraintStatus = async (req, res) => {
  try {
    const { communityId } = req.query;
    const userId = req.user.id;
    const result = await Community.aggregate([
      { $match: { _id: mongoose.Types.ObjectId(communityId) } },
      {
        $project: {
          isMuted: { $in: [userId, { $ifNull: ['$muted', []] }] },
          isSeeingLessFeed: {
            $in: [userId, { $ifNull: ['$seeLessFeed', []] }],
          },
        },
      },
    ]);
    if (result.length === 0) {
      return res.status(StatusCodes.NOT_FOUND).send('Community not found.');
    }
    const { isMuted, isSeeingLessFeed } = result[0];
    return res.status(StatusCodes.OK).json({ isMuted, isSeeingLessFeed });
  } catch (error) {
    console.error(error.message);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send('Something went wrong.');
  }
};

module.exports = {
  createCommunity,
  deleteCommunity,
  joinAsMember,
  leaveAsMember,
  uploadContent,
  deleteContent,
  flag,
  takeDown,
  updateStreak,
  likesAndPosts,
  rating,
  getAllCommunities,
  getCommunityById,
  getCommunityByTag,
  isMember,
  getContentOfACommunity,
  getCommunitiesPartOf,
  getLatestContent,
  getCommunityProfile,
  getUserProfile,
  getLikeAndFlagStatus,
  getBasicCommunityDataFromId,
  getUserContributionCover,
  getContribution,
  getAllTags,
  getLikedPosts,
  getFastFeed,
  getFastNativeFeed,
  post,
  editCommunityProfile,
  getAllContributionOfUser,
  getAllMembers,
  getAllRelatedSocialGroups,
  getBatchedContent,
  getOthersContributionCover,
  getMediaAndDocs,
  gotOffline,
  addToConstraintList,
  removeFromConstraintList,
  getConstraintStatus,
};
