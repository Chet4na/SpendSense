// MongoDB demo commands for the viva. Run with:
//   docker exec -it spendsense-mongo-1 mongosh spendsense_logs db/mongo_queries.js
// or paste the lines into mongosh after `use spendsense_logs`.

// CREATE: collections and indexes (the app creates these in lib/mongo.js)
db.audit_logs.createIndex({ user_id: 1, ts: -1 });
db.activity_events.createIndex({ ts: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 }); // TTL: 90 days
db.activity_events.createIndex({ action: 1, ts: -1 });
printjson(db.activity_events.getIndexes());

// INSERT: one demo document
db.activity_events.insertOne({ user_id: 2, action: 'viva_demo', meta: { note: 'inserted from mongosh' }, ts: new Date() });

// READ: find with filter, projection, sort and limit
printjson(db.audit_logs.find({ entity: 'transaction' }, { action: 1, entity_id: 1, after: 1, ts: 1 }).sort({ ts: -1 }).limit(5).toArray());
print('activity events:', db.activity_events.countDocuments());

// READ: aggregation pipeline (events per action)
printjson(db.activity_events.aggregate([
  { $group: { _id: '$action', events: { $sum: 1 } } },
  { $sort: { events: -1 } },
]).toArray());

// UPDATE: mark the latest audit entry as reviewed
const latest = db.audit_logs.find().sort({ ts: -1 }).limit(1).toArray()[0];
if (latest) {
  printjson(db.audit_logs.updateOne({ _id: latest._id }, { $set: { reviewed: true, reviewed_by: 1, reviewed_at: new Date(), review_note: 'checked in viva' } }));
  printjson(db.audit_logs.findOne({ _id: latest._id }, { reviewed: 1, reviewed_by: 1, review_note: 1 }));
}

// DELETE: remove the demo document, and activity older than 30 days
printjson(db.activity_events.deleteOne({ action: 'viva_demo' }));
printjson(db.activity_events.deleteMany({ ts: { $lt: new Date(Date.now() - 30 * 86400000) } }));
