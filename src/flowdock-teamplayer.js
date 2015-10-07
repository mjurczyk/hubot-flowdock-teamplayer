var Adapter, Flowdock, TextMessage, flowdock, prequire, ref, ref1,
  extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  hasProp = {}.hasOwnProperty,
  slice = [].slice,
  indexOf = [].indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; };

flowdock = require('flowdock');

try {
  ref = require('hubot'), Adapter = ref.Adapter, TextMessage = ref.TextMessage;
} catch (_error) {
  prequire = require('parent-require');
  ref1 = prequire('hubot'), Adapter = ref1.Adapter, TextMessage = ref1.TextMessage;
}

Flowdock = (function(superClass) {
  extend(Flowdock, superClass);

  function Flowdock() {
    var i, id, len, ref2;
    Flowdock.__super__.constructor.apply(this, arguments);
    this.ignores = [];
    if (process.env.HUBOT_FLOWDOCK_ALLOW_ANONYMOUS_COMMANDS !== '1') {
      this.ignores.push('0');
    }
    if (process.env.HUBOT_FLOWDOCK_IGNORED_USERS != null) {
      ref2 = process.env.HUBOT_FLOWDOCK_IGNORED_USERS.split(',');
      for (i = 0, len = ref2.length; i < len; i++) {
        id = ref2[i];
        this.ignores.push(id);
      }
    }
    if (this.ignores.length > 0) {
      this.robot.logger.info("Ignoring all messages from user ids " + (this.ignores.join(', ')));
    }
  }

  Flowdock.prototype.send = function() {
    var envelope, flow, forceNewMessage, message_id, metadata, ref2, self, sendRest, str, strings, thread_id, user;
    envelope = arguments[0], strings = 2 <= arguments.length ? slice.call(arguments, 1) : [];
    if (strings.length === 0) {
      return;
    }
    self = this;
    str = strings.shift();
    if (str.length > 8096) {
      str = "** End of Message Truncated **\n" + str;
      str = str.slice(0, 8096);
    }
    metadata = envelope.metadata || ((ref2 = envelope.message) != null ? ref2.metadata : void 0) || {};
    flow = metadata.room || envelope.room;
    thread_id = metadata.thread_id;
    message_id = metadata.message_id;
    user = envelope.user;
    forceNewMessage = envelope.newMessage === true;
    sendRest = function() {
      return self.send.apply(self, [envelope].concat(slice.call(strings)));
    };
    if (user != null) {
      if (flow != null) {
        if (thread_id && !forceNewMessage) {
          return this.bot.threadMessage(flow, thread_id, str, [], sendRest);
        } else if (message_id && !forceNewMessage) {
          return this.bot.comment(flow, message_id, str, [], sendRest);
        } else {
          return this.bot.message(flow, str, [], sendRest);
        }
      } else if (user.id) {
        str = str.replace(new RegExp("^@" + user.name + ": ", "i"), '');
        return this.bot.privateMessage(user.id, str, [], sendRest);
      }
    } else if (flow) {
      flow = this.findFlow(flow);
      return this.bot.message(flow, str, [], sendRest);
    }
  };

  Flowdock.prototype.reply = function() {
    var envelope, strings, user;
    envelope = arguments[0], strings = 2 <= arguments.length ? slice.call(arguments, 1) : [];
    user = this.userFromParams(envelope);
    return this.send.apply(this, [envelope].concat(slice.call(strings.map(function(str) {
      return "@" + user.name + ": " + str;
    }))));
  };

  Flowdock.prototype.userFromParams = function(params) {
    if (params.user) {
      return params.user;
    } else {
      return params;
    }
  };

  Flowdock.prototype.findFlow = function(identifier) {
    var flow, i, j, k, len, len1, len2, ref2, ref3, ref4;
    ref2 = this.flows;
    for (i = 0, len = ref2.length; i < len; i++) {
      flow = ref2[i];
      if (identifier === flow.id) {
        return flow.id;
      }
    }
    ref3 = this.flows;
    for (j = 0, len1 = ref3.length; j < len1; j++) {
      flow = ref3[j];
      if (identifier === this.flowPath(flow)) {
        return flow.id;
      }
    }
    ref4 = this.flows;
    for (k = 0, len2 = ref4.length; k < len2; k++) {
      flow = ref4[k];
      if (identifier.toLowerCase() === flow.name.toLowerCase()) {
        return flow.id;
      }
    }
    return identifier;
  };

  Flowdock.prototype.flowPath = function(flow) {
    return flow.organization.parameterized_name + '/' + flow.parameterized_name;
  };

  Flowdock.prototype.joinedFlows = function() {
    return this.flows.filter(function(f) {
      return f.joined && f.open;
    });
  };

  Flowdock.prototype.userFromId = function(id, data) {
    var ref2;
    return ((ref2 = this.robot.brain) != null ? typeof ref2.userForId === "function" ? ref2.userForId(id, data) : void 0 : void 0) || this.userForId(id, data);
  };

  Flowdock.prototype.changeUserNick = function(id, newNick) {
    if (id in this.robot.brain.data.users) {
      return this.robot.brain.data.users[id].name = newNick;
    }
  };

  Flowdock.prototype.needsReconnect = function(message) {
    var ref2;
    return (this.myId(message.content) && message.event === 'backend.user.block') || (this.myId(message.user) && ((ref2 = message.event) === 'backend.user.join' || ref2 === 'flow-add' || ref2 === 'flow-remove'));
  };

  Flowdock.prototype.myId = function(id) {
    // NOTE This check doesn't make sense, since it is regexped later anyways
    return false;
  };

  Flowdock.prototype.reconnect = function(reason) {
    this.robot.logger.info("Reconnecting: " + reason);
    this.stream.end();
    this.stream.removeAllListeners();
    return this.fetchFlowsAndConnect();
  };

  Flowdock.prototype.connect = function() {
    var flow, ids;
    ids = (function() {
      var i, len, ref2, results;
      ref2 = this.joinedFlows();
      results = [];
      for (i = 0, len = ref2.length; i < len; i++) {
        flow = ref2[i];
        results.push(flow.id);
      }
      return results;
    }).call(this);
    this.robot.logger.info('Flowdock: connecting');
    this.stream = this.bot.stream(ids, {
      active: 'idle',
      user: 1
    });
    this.stream.on('connected', (function(_this) {
      return function() {
        _this.robot.logger.info('Flowdock: connected and streaming');
        return _this.robot.logger.info('Flowdock: listening to flows:', ((function() {
          var i, len, ref2, results;
          ref2 = this.joinedFlows();
          results = [];
          for (i = 0, len = ref2.length; i < len; i++) {
            flow = ref2[i];
            results.push(flow.name);
          }
          return results;
        }).call(_this)).join(', '));
      };
    })(this));
    this.stream.on('clientError', (function(_this) {
      return function(error) {
        return _this.robot.logger.error('Flowdock: client error:', error);
      };
    })(this));
    this.stream.on('disconnected', (function(_this) {
      return function() {
        return _this.robot.logger.info('Flowdock: disconnected');
      };
    })(this));
    this.stream.on('reconnecting', (function(_this) {
      return function() {
        return _this.robot.logger.info('Flowdock: reconnecting');
      };
    })(this));
    return this.stream.on('message', (function(_this) {
      return function(message) {
        var author, botPrefix, hubotMsg, influxTag, messageId, messageObj, metadata, msg, ref2, ref3, regex, thread_id;
        if ((message.content == null) || (message.event == null) || (message.id == null)) {
          return;
        }
        if (message.event === 'user-edit' || message.event === 'backend.user.join') {
          _this.changeUserNick(message.content.user.id, message.content.user.nick);
        }
        if (_this.needsReconnect(message)) {
          _this.reconnect('Reloading flow list');
        }
        if ((ref2 = message.event) !== 'message' && ref2 !== 'comment') {
          return;
        }
        if (_this.myId(message.user)) {
          return;
        }
        if (ref3 = String(message.user), indexOf.call(_this.ignores, ref3) >= 0) {
          return;
        }
        _this.robot.logger.debug('Received message', message);
        author = _this.userFromId(message.user);
        thread_id = message.thread_id;
        messageId = thread_id != null ? void 0 : message.event === 'message' ? message.id : message.tags ? (influxTag = (function() {
          var i, len, ref4, tag;
          ref4 = message.tags;
          for (i = 0, len = ref4.length; i < len; i++) {
            tag = ref4[i];
            if (/^influx:/.test(tag)) {
              return tag;
            }
          }
        })(), influxTag ? (influxTag.split(':', 2))[1] : void 0) : void 0;
        msg = message.event === 'comment' ? message.content.text : message.content;
        botPrefix = _this.robot.name + ": ";
        regex = new RegExp("^@(team|all|" + _this.bot.userName + ")(,|\\b)", "i");
        hubotMsg = msg.replace(regex, botPrefix);
        if (!message.flow && !hubotMsg.match(new RegExp("^(team|all|" + _this.robot.name + ")", "i"))) {
          hubotMsg = botPrefix + hubotMsg;
        }
        author.room = message.flow;
        author.flow = message.flow;
        metadata = {
          room: message.flow
        };
        if (thread_id != null) {
          metadata['thread_id'] = thread_id;
        }
        if (messageId != null) {
          metadata['message_id'] = messageId;
        }
        messageObj = new TextMessage(author, hubotMsg, message.id, metadata);
        if (messageObj.metadata == null) {
          messageObj.metadata = metadata;
        }
        return _this.receive(messageObj);
      };
    })(this));
  };

  Flowdock.prototype.run = function() {
    this.apiToken = process.env.HUBOT_FLOWDOCK_API_TOKEN;
    this.loginEmail = process.env.HUBOT_FLOWDOCK_LOGIN_EMAIL;
    this.loginPassword = process.env.HUBOT_FLOWDOCK_LOGIN_PASSWORD;
    if (this.apiToken != null) {
      this.bot = new flowdock.Session(this.apiToken);
    } else if ((this.loginEmail != null) && (this.loginPassword != null)) {
      this.bot = new flowdock.Session(this.loginEmail, this.loginPassword);
    } else {
      throw new Error("ERROR: No credentials given: Supply either environment variable HUBOT_FLOWDOCK_API_TOKEN or both HUBOT_FLOWDOCK_LOGIN_EMAIL and HUBOT_FLOWDOCK_LOGIN_PASSWORD");
    }
    this.bot.on("error", (function(_this) {
      return function(e) {
        _this.robot.logger.error("Unexpected error in Flowdock client: " + e);
        return _this.emit(e);
      };
    })(this));
    this.fetchFlowsAndConnect();
    return this.emit('connected');
  };

  Flowdock.prototype.fetchFlowsAndConnect = function() {
    return this.bot.flows((function(_this) {
      return function(err, flows, res) {
        var data, flow, i, j, len, len1, ref2, savedUser, user;
        if (err != null) {
          return;
        }
        _this.bot.userId = res.headers['flowdock-user'];
        _this.flows = flows;
        _this.robot.logger.info("Found " + _this.flows.length + " flows, and I have joined " + (_this.joinedFlows().length) + " of them.");
        for (i = 0, len = flows.length; i < len; i++) {
          flow = flows[i];
          ref2 = flow.users;
          for (j = 0, len1 = ref2.length; j < len1; j++) {
            user = ref2[j];
            data = {
              id: user.id,
              name: user.nick
            };
            savedUser = _this.userFromId(user.id, data);
            if (savedUser.name !== data.name) {
              _this.changeUserNick(savedUser.id, data.name);
            }
            if (String(user.id) === String(_this.bot.userId)) {
              _this.bot.userName = user.nick;
            }
          }
        }
        _this.robot.logger.info("Connecting to Flowdock as user " + _this.bot.userName + " (id " + _this.bot.userId + ").");
        if (_this.flows.length === 0 || !_this.flows.some(function(flow) {
          return flow.open;
        })) {
          _this.robot.logger.warning("Your bot is not part of any flows and probably won't do much. " + "Join some flows manually or add the bot to some flows and reconnect.");
        }
        if ((_this.bot.userName != null) && _this.robot.name.toLowerCase() !== _this.bot.userName.toLowerCase()) {
          _this.robot.logger.warning(("You have configured this bot to use the wrong name (" + _this.robot.name + "). Flowdock API says ") + ("my name is " + _this.bot.userName + ". You will run into problems if you don't fix this!"));
        }
        return _this.connect();
      };
    })(this));
  };

  return Flowdock;

})(Adapter);

exports.use = function(robot) {
  return new Flowdock(robot);
};

// ---
// generated by coffee-script 1.9.2
