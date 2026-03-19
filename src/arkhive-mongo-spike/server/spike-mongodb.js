//============================================================
//File:        main.js
//Author:      Aryan Cyrus 33114242
//Created:     2026-0-19
//Description: Tech Spike for mongoDB accessed through meteor
//Version:     1.0



//Last Updated:2026-03-19 by Aryan Cyrus
//============================================================


import { Meteor } from "meteor/meteor";
import { LinksCollection } from "/imports/api/links";
import { Random } from "meteor/random";
import { Mongo } from 'meteor/mongo';

// Define a MongoDB collection — Meteor creates it automatically
const Receipts = new Mongo.Collection('receipts');

Meteor.startup(async () => {

  // Clear collection each run so we start fresh
  await Receipts.removeAsync({});

  // INSERT
  const id = await Receipts.insertAsync({
    store: 'Woolworths',
    total: 42.50,
    date: new Date()
  });
  console.log('Inserted ID:', id);

  // FIND
  const all = await Receipts.find().fetchAsync();
  console.log('All receipts:', all);

  // UPDATE
  await Receipts.updateAsync(id, { $set: { total: 99.99 } });
  const updated = await Receipts.findOneAsync(id);
  console.log('Updated receipt:', updated);

  // DELETE
  await Receipts.removeAsync(id);
  const afterDelete = await Receipts.find().fetchAsync();
  console.log('After delete:', afterDelete);

});