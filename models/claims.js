var mongo = require('mongodb');
var config = require('config');
var auth = require('./auth.js');
var Server = mongo.Server,
    Db = mongo.Db,
    BSON = mongo.BSONPure;
    ObjectID = mongo.ObjectID;
var jwt    = require('jsonwebtoken');
var server = new Server(config.get('DBHost'),config.get('DBPort'), {auto_reconnect: true});
var db = new Db(config.get('DBName'), server);
var passwordHash = require('password-hash');
var randtoken = require('rand-token');
var crypto = require('crypto');
var mailgun_params = config.get('mailgun_params');
var mailgun = require('mailgun-js')(mailgun_params);

// db.open(function(err, db) {
//     if (!err) {
//         console.log("Connected to database");
//     } else {
//         console.log("database connection error");
//     }
// });

// Now set up a Mongo Client ====
const MongoClient = mongo.MongoClient;
var db;

MongoClient.connect(config.get('poc_mongo'), function(err, database) {
    if (err) return console.log(err);
    db = database;
});

function create_votes(users, voting_round_id, claim_id) {
    users.forEach(function(user) {
        vote = {};
        vote['claim_id'] = claim_id;
        vote['voter_id'] = user['_id'].toString();
        vote['voting_round_id'] = voting_round_id;
        db.collection('votes', function(err, votes_collection) {
            votes_collection.insert(vote, {
                safe: true
            }, function(err, result) {

                if(!err)
                {
                    name = user['name']
                    email = user['email']
                    var msg_text = "Dear " + name + ", <br><br> A new claim has been opened up for you to vote on. You can see the claim in this <a href='" + config.get('app_url')  + "claims/" + claim_id + "'>link</a> <br><br> The Indorse Community looks forward to your positive participation.<br><br> Thank you and regards <br> Team Indorse <br><br> Please let us know if you have any problems or questions at: <br> www.indorse.io";
                    var sub_text = 'You are invited to vote on a new claim';
                    var data = {
                        from: 'Indorse <info@app.indorse.io>',
                        to: email,
                        subject: sub_text,
                        html: msg_text
                    };
                    mailgun.messages().send(data, function (error, response) {
                    
                    });      
                }

            })
        })
    });
}

function create_votinground(claim_id,owner_id) {
    console.log('calling voting round creationg function for claim id ' + claim_id);
    db.collection('votingrounds', function(err, votinground_collection) {
        if (!err) {
            voting_round = {};
            voting_round['claim_id'] = claim_id;
            voting_round['end_registration'] = Math.floor(Date.now() / 1000) + config.get('registerperiod');
            voting_round['end_voting'] = Math.floor(Date.now() / 1000) + config.get('voteperiod');
            voting_round['status'] = 'in_progress';
            console.log(voting_round)
            votinground_collection.insert(voting_round, {
                safe: true
            }, function(err, result) {
                if (!err) {
                    voting_round_id = result['ops'][0]['_id'].toString();
                    console.log(voting_round_id);
                    db.collection('users', function (err, users_collection) {
                                
                                emails_array = ['gaurang@attores.com','dipesh@attores.com','david@attores.com','avad@attores.com','telepras@gmail.com','kedar@blimp.co.in'];
                                users_collection.find({'email': {'$in': emails_array}}).toArray(function (err, user_results) {
                               
                                    var  limit = config.get('user_limit_vote');
                                    users_collection.aggregate([{'$match' : {'approved': true,'email' : {'$nin' : emails_array}}},{'$sample' : {'size' : limit}}]).toArray(function (err, all_users) {
                                    
                                            user_results = user_results.concat(all_users);
                                            console.log('Seleceted users for voting');
                                            user_results.forEach(function(user){

                                                    console.log(user['email']);

                                            })
                                            create_votes(user_results, voting_round_id, claim_id)
                                    })
                            })
                    })
                }
            })
        } else {
            console.log(err)
        }
    })
}

exports.claim = function(req, res) {

    if ('login' in req.body && req.body.login) {
        var info = req.body;
        if ('title' in info && info['title'] != '' && 'desc' in info && info['desc'] != '' && 'proof' in info && info['proof'] != '') {

            db.collection('users', function(err, collection) {
                collection.findOne({
                    'email': info['email']
                }, function(err, item) {

                    if (item) {


                        if ('claim_id' in info && info['claim_id'] != '') {
                            res.send(501, {
                                success: false,
                                message: 'Claim id should not be sent'
                            });
                        } else {
                            var claim = {};
                            claim['title'] = info['title'];
                            claim['desc'] = info['desc']
                            claim['proof'] = info['proof']
                            claim['type'] = info['type'];
                            claim['state'] = 'new';
                            claim['visible'] = true
                            claim['ownerid'] = item['_id'].toString();

                            if(claim['type'] == 'github') {
                                claim['token'] = randtoken.uid(16);
                            }

                            db.collection('claims', function(err, collection1) {
                                collection1.insert(claim, {
                                    safe: true
                                }, function(err, result) {
                                    if (err) {
                                        res.send(501, {
                                            success: false,
                                            message: 'Something went wrong'
                                        });
                                    } else {
                                        if ('result' in result && 'ok' in result['result'] && result['result']['ok'] == 1) {
                                            create_votinground(result['ops'][0]['_id'].toString(),claim['ownerid']);
                                            name = item['name']
                                            email = item['email']
                                            var msg_text = `Dear ${name}, <br><br> You have claimed as owner to a github repository. Please add the token <b>${claim['token']}</b> to your github repository in a file named INDORSE_VERIFICATION in the root of your repository. The Indorse Community looks forward to your positive participation.<br><br> Thank you and regards <br> Team Indorse <br><br> Please let us know if you have any problems or questions at: <br> www.indorse.io`;
                                            var sub_text = 'Claim to github repository';
                                            var data = {
                                                from: 'Indorse <info@app.indorse.io>',
                                                to: email,
                                                subject: sub_text,
                                                html: msg_text
                                            };
                                            mailgun.messages().send(data, function (error, response) {
                                                console.log(error, response);
                                            });
                                            res.send(200, {
                                                success: true,
                                                claim: result['ops'],
                                                message: config.get('Msg34')
                                            });
                                        } else {
                                            res.send(501, {
                                                success: false,
                                                message: config.get('Msg10')
                                            });
                                        }

                                    }

                                })
                            })

                        }



                    } else {
                        res.send(404, {
                            success: false,
                            message: config.get('Msg35')
                        });
                    }

                })
            })


        } else {
            res.send(422, {
                success: false,
                message: config.get('Msg36')
            });
        }
    } else {
        res.send(401, {
            success: false,
            message: config.get('Msg28')
        });
    }
}

exports.confirmClaim = (req, res) => {
    
}


exports.updateClaims = function(req, res) {

    if ('login' in req.body && req.body.login) {
        var info = req.body;
        if ('title' in info && info['title'] != '' && 'desc' in info && info['desc'] != '' && 'proof' in info && info['proof'] != '') {

            db.collection('users', function(err, collection) {
                collection.findOne({
                    'email': info['email']
                }, function(err, item) {

                    if (item) {


                        if ('claim_id' in info && info['claim_id'] != '') {
                            db.collection('claims', function(err, collection1) {

                                collection1.findOne({
                                    '_id': new ObjectID(info['claim_id'])
                                }, function(err, currclaim) {

                                    if (currclaim) {
                                        var claim = {};
                                        currclaim['title'] = info['title'];
                                        currclaim['desc'] = info['desc']
                                        currclaim['proof'] = info['proof'];
                                        if ('visible' in info && info['visible'] != '') {
                                            currclaim['visible'] = info['visible'];
                                        }
                                        if ('archive' in info && info['archive'] != '') {
                                            currclaim['archive'] = info['archive'];
                                        }
                                        collection1.update({
                                            '_id': new ObjectID(info['claim_id'])
                                        }, {$set: currclaim}, {
                                            safe: true
                                        }, function(err, result) {

                                            if (err) {
                                                res.send(501, {
                                                    success: false,
                                                    message: config.get('Msg37')
                                                });
                                            } else {
                                                res.send(200, {
                                                    success: true,
                                                    message: config.get('Msg38')
                                                });
                                            }

                                        })
                                    } else {
                                        res.send(404, {
                                            success: false,
                                            message: config.get('Msg39')
                                        });
                                    }
                                })

                            })
                        } else {
                            res.send(422, {
                                success: false,
                                message: config.get('Msg40')
                            });
                        }



                    } else {
                        res.send(404, {
                            success: false,
                            message: config.get('Msg41')
                        });
                    }

                })
            })


        } else {
            res.send(422, {
                success: false,
                message: config.get('Msg42')
            });
        }
    } else {
        res.send(401, {
            success: false,
            message: config.get('Msg28')
        });
    }
}

exports.getclaims = function(req, res) {
    if ('login' in req.body && req.body.login) {
        var info = req.body;
        if ('user_id' in info && info['user_id'] != '') {
            db.collection('users', function(err, collection) {
                collection.findOne({
                    '_id': new ObjectID(info['user_id'])
                }, function(err, item) {
                    if (item) {
                        db.collection('claims', function(err, collection1) {
                            if (err) {
                                res.send(501, {
                                    success: false,
                                    message: config.get('Msg10')
                                });
                            } else {
                                collection1.find({
                                    'ownerid': info['user_id']
                                }).toArray(function(err, results) {

                                    var claim_ids = [];
                                    results.forEach(function(claim) {
                                        claim_ids.push(claim['_id'].toString());
                                    })
                                    db.collection('votingrounds', function(err, votinground_collection) {
                                        votinground_collection.find({
                                            'claim_id': {
                                                '$in': claim_ids
                                            }
                                        }).toArray(function(err, votingrounds) {
                                            var results_final = [];
                                            var active_voting_round = null;
                                            var active_votinground_ids = [];
                                            for (var i = 0, len = results.length; i < len; i++) {
                                                var result_item = {};
                                                result_item.claim = results[i];
                                                var item_voting_rounds = [];
                                                votingrounds.forEach(function(votinground) {
                                                    if (votinground['claim_id'] == results[i]._id.toString()) {
                                                        if (votinground['status'] == "in_progress") {
                                                            result_item.votinground = votinground;
                                                            active_votinground_ids.push(votinground['_id'].toString());

                                                        }
                                                    }
                                                })
                                                results_final.push(result_item);
                                            }
                                            collection.findOne({
                                                'email': info['email']
                                            }, function(err, user) {
                                                if (user) {
                                                    db.collection('votes', function(err, votes_collection) {
                                                        votes_collection.find({
                                                            'voting_round_id': {
                                                                '$in': active_votinground_ids
                                                            },
                                                            'voter_id': user['_id'].toString()
                                                        }).toArray(function(err, votes) {
                                                            if (!err) {
                                                                for (var i = 0, len = results_final.length; i < len; i++) {
                                                                    votes.forEach(function(vote) {
                                                                        if (results_final[i].claim._id.toString() == vote['claim_id']) {
                                                                            results_final[i].vote = vote;
                                                                        }
                                                                    })
                                                                }
                                                                res.send(200, {
                                                                    success: true,
                                                                    'claims': results_final
                                                                });
                                                            }
                                                        });
                                                    });
                                                }
                                            });
                                        })
                                    })
                                })
                            }

                        })
                    } else {
                        res.send(404, {
                            success: false,
                            message: config.get('Msg41')
                        });
                    }
                })
            })
        } else if ('claim_id' in info && info['claim_id'] != '') {
            db.collection('claims', function(err, collection) {
                if (!err) {
                    collection.findOne({
                        '_id': new ObjectID(info['claim_id'])
                    }, function(err, item) {
                        if (item) {
                            db.collection('votingrounds', function(err, votinground_collection) {
                                votinground_collection.find({
                                    'claim_id': info['claim_id']
                                }).toArray(function(err, votingrounds) {
                                    if (!err) {
                                        var active_votinground = null;
                                        var vote = null;
                                        votingrounds.forEach(function(votinground) {
                                            if (votinground.status == "in_progress")
                                                active_votinground = votinground;
                                        })
                                        if (active_votinground != null) {
                                            db.collection('users', function(err, collection) {

                                                collection.findOne({
                                                    'email': info['email']
                                                }, function(err, user) {

                                                    if (user) {
                                                        db.collection('votes', function(err, votes_collection) {

                                                            votes_collection.findOne({
                                                                'voting_round_id': active_votinground['_id'].toString(),
                                                                'voter_id': user['_id'].toString()
                                                            }, function(err, vote) {

                                                                if (vote) {
                                                                    res.send(200, {
                                                                        success: true,
                                                                        claim: item,
                                                                        votingrounds: votingrounds,
                                                                        vote: vote
                                                                    });
                                                                }

                                                            })

                                                        })
                                                    }

                                                })

                                            })
                                        } else {
                                            res.send(200, {
                                                success: true,
                                                claim: item,
                                                votingrounds: votingrounds,
                                                vote: vote
                                            });
                                        }
                                    } else {
                                        res.send(501, {
                                            success: false,
                                            message: config.get('Msg10')
                                        });
                                    }
                                })
                            })
                        } else {
                            res.send(404, {
                                success: false,
                                'message': config.get('Msg39')
                            });
                        }
                    })
                }
            })
        } else {
            res.send(422, {
                success: false,
                message: config.get('Msg43')
            });
        }
    } else {
        res.send(401, {
            success: false,
            message: config.get('Msg28')
        });
    }
}