const EventEmitter = require('events');

// Central emitter for userlist changes originating from DB mutations.
// Other parts of the app can subscribe to coalesce/refresh the in-memory cache.
class UserlistEmitter extends EventEmitter {}

const userlistEvents = new UserlistEmitter();
const USERLIST_CHANGED = 'userlist.changed';

module.exports = {
  userlistEvents,
  USERLIST_CHANGED,
};
