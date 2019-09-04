#!/usr/bin/env node
'use strict'


const formidable = require('formidable');
const express = require('express')
const medUtils = require('openhim-mediator-utils')
const winston = require('winston')
const moment = require('moment');
var request = require('request');

const utils = require('./utils')

// Logging setup
winston.remove(winston.transports.Console)
winston.add(winston.transports.Console, {level: 'info', timestamp: true, colorize: true})

// Config
var config = {} // this will vary depending on whats set in openhim-core
const apiConf = process.env.NODE_ENV === 'test' ? require('../config/test') : require('../config/config')
const mediatorConfig = require('../config/mediator')

var port = process.env.NODE_ENV === 'test' ? 7001 : mediatorConfig.endpoints[0].port

var tests = {
    viral_load_2: {
        form: "Adult HIV Flowsheet - New Lab",
        visitType: "Primary Care Outpatient",
        encounterType: "HIV VISIT",
        parentConcept: "LABORATORY EXAMINATIONS CONSTRUCT",
        concept: "HIV VIRAL LOAD",
    },
    recency_vl: {
        q: "RECENCY", //the key word to research the recency concept list
        form: "Confidential HIV CRF - SECTION 1: Enrollment Information",
        visitType: "Primary Care Outpatient",
        encounterType: "HIV VISIT",
        recencyAssayResultConcept: "RECENCY ASSAY RESULTS",
        recencyAssayTestConcept: "RECENCY ASSAY TEST",
        recencyViralLoadResultConcept: "RECENCY VIRAL LOAD RESULT",
        recencyViralLoadTestDateConcept: "RECENCY VIRAL LOAD TEST DATE"
    },
    hiv_recency: {
        form: "XXXXX",
        concept: "XXXXX",
        parentConcept: "LABORATORY EXAMINATIONS CONSTRUCT", //Check this,
        encounterType: "HIV VISIT"//Check this,
    },
}


var locations = {
    l_448: "ec098275-651d-4852-9603-aa0e1d88297f"
}



function _getTheGoodResult(results, fieldCompare, value) {
    var result = undefined;
    if (results && results.length > 1) {
        var n;
        for (n = 0; n < results.length; n++) {
            if (results[n][fieldCompare] && results[n][fieldCompare] == value) {
                return results[n];
            }
        }
    } else if (results) {
        return results[0];
    }
    return undefined;
}

/**
 * setupApp - configures the http server for this mediator
 *
 * @return {express.App}  the configured http server
 */
function setupApp() {
    const app = express()
    var needle = require('needle');


    app.all('*', (req, res) => {
        winston.info(`Processing ${req.method} request on ${req.url}`)
        var responseBody = 'Primary Route Reached'
        var headers = {'content-type': 'application/json'}

        // add logic to alter the request here

        // capture orchestration data
        var orchestrationResponse = {statusCode: 200, headers: headers}
        let orchestrations = []
        orchestrations.push(utils.buildOrchestration('Primary Route', new Date().getTime(), req.method, req.url, req.headers, req.body, orchestrationResponse, responseBody))

        // set content type header so that OpenHIM knows how to handle the response
        res.set('Content-Type', 'application/json+openhim')


        // construct return object
        var properties = {property: 'Primary Route'}

        if (req.method == 'POST' && req.url == apiConf.api.urlPattern) {
            var form = new formidable.IncomingForm();
            form.parse(req, function (err, fields, files) {
                var data = fields;
                console.log('Got data', data);


                var nd_of_research = 0;
                function LoopA(q) {
                    nd_of_research = nd_of_research + 1;
                    if (q && q != "") {
                        var options = {
                            url: "http://172.16.170.134:8080/openmrs/ws/rest/v1/patient?q=" + q + "&v=full",
                            headers: {
                                'Authorization': 'Basic ' + new Buffer("geoffrey:Ganyugxy1").toString('base64'),
                                'Content-Type': 'application/json'
                            }
                        }

                        var testType = data.TestId.toLowerCase();

                        //// 1. Patient
                        request.get(options, function (error, response, body) {
                            if (error) {
                                console.log(error);
                                res.sendStatus(500)
                            } else {
                                if (response.statusCode == "200") {
                                    var results = JSON.parse(body).results;
                                    var patient = undefined;
                                    if (results && results.length == 1) {
                                        patient = results[0];

                                        switch (testType) {
                                            case 'viral_load_2':

                                                options = {
                                                    url: "http://172.16.170.134:8080/openmrs/ws/rest/v1/form?q=" + tests.viral_load_2.form + "&v=full",
                                                    headers: {
                                                        'Authorization': 'Basic ' + new Buffer("geoffrey:Ganyugxy1").toString('base64'),
                                                        'Content-Type': 'application/json'
                                                    }
                                                }

                                                //// 2. Form 
                                                request.get(options, function (error, response, body) {
                                                    if (error) {
                                                        console.log(error);
                                                        res.sendStatus(500);
                                                    } else {
                                                        var form = JSON.parse(body).results;
                                                        if (form && form.length > 0) {
                                                            form = _getTheGoodResult(form, "display", tests.viral_load_2.form)
                                                            options = {
                                                                url: "http://172.16.170.134:8080/openmrs/ws/rest/v1/concept?q=" + tests.viral_load_2.parentConcept + "&v=full",
                                                                headers: {
                                                                    'Authorization': 'Basic ' + new Buffer("geoffrey:Ganyugxy1").toString('base64'),
                                                                    'Content-Type': 'application/json'
                                                                }
                                                            }

                                                            //// 3. Parent concept
                                                            request.get(options, function (error, response, body) {
                                                                if (error) {
                                                                    console.log(error);
                                                                    res.sendStatus(500)
                                                                } else {
                                                                    var parentConcept = JSON.parse(body).results;
                                                                    if (parentConcept && parentConcept.length > 0) {
                                                                        parentConcept = _getTheGoodResult(parentConcept, "display", tests.viral_load_2.parentConcept)

                                                                        options = {
                                                                            url: "http://172.16.170.134:8080/openmrs/ws/rest/v1/concept?q=" + tests.viral_load_2.concept,
                                                                            headers: {
                                                                                'Authorization': 'Basic ' + new Buffer("geoffrey:Ganyugxy1").toString('base64'),
                                                                                'Content-Type': 'application/json'
                                                                            }
                                                                        };

                                                                        //// 4. Concept
                                                                        request.get(options, function (error, response, body) {
                                                                            if (error) {
                                                                                console.log(error);
                                                                                res.sendStatus(500)
                                                                            } else {
                                                                                var concept = JSON.parse(body).results;
                                                                                if (concept && concept.length > 0) {
                                                                                    concept = _getTheGoodResult(concept, "display", tests.viral_load_2.concept)

                                                                                    var encounterOptions = {
                                                                                        url: "http://172.16.170.134:8080/openmrs/ws/rest/v1/encounter",
                                                                                        body: JSON.stringify(
                                                                                                {
                                                                                                    "patient": patient.uuid,
                                                                                                    "form": form.uuid, //uuid of the concerned form in openmrs
                                                                                                    "encounterType": form.encounterType.uuid, //uuid of encounterType
                                                                                                    "location": locations.l_448, //uuid of localtion
                                                                                                    "encounterDatetime": (new Date()).toISOString(),
                                                                                                    "obs": [
                                                                                                        {
                                                                                                            "concept": parentConcept.uuid, //uuid of perent concept
                                                                                                            "person": patient.uuid, //uuid of patient
                                                                                                            "obsDatetime": (new Date()).toISOString(),
                                                                                                            "groupMembers": [
                                                                                                                {
                                                                                                                    "concept": concept.uuid, //uuid of concept
                                                                                                                    "person": patient.uuid, //uuid of patient
                                                                                                                    "location": locations.l_448, //uuid of location
                                                                                                                    "obsDatetime": (new Date()).toISOString(),
                                                                                                                    "value": data.Result.copies, //hiv concentration value (copie/ml) comming from labware
                                                                                                                    "resourceVersion": "1.8"//OpenMRS version
                                                                                                                }
                                                                                                            ],
                                                                                                            "location": locations.l_448//uuid of location
                                                                                                        }
                                                                                                    ],
                                                                                                    "encounterProviders": [{
                                                                                                            "encounterRole": "a0b03050-c99b-11e0-9572-0800200c9a66",
                                                                                                            "provider": "prov9b01-f749-4b3f-b8fe-8f6d460003bb",
                                                                                                            "resourceVersion": "1.9"//OpenMRS version
                                                                                                        }]
                                                                                                }
                                                                                        ),
                                                                                        headers: {
                                                                                            'Authorization': 'Basic ' + new Buffer("geoffrey:Ganyugxy1").toString('base64'),
                                                                                            'Content-Type': 'application/json'
                                                                                        }
                                                                                    };

                                                                                    request.post(encounterOptions, function (error, response, body) {
                                                                                        if (error) {
                                                                                            console.log(error);
                                                                                            res.sendStatus(500)
                                                                                        } else {
                                                                                            res.sendStatus(200)
                                                                                        }
                                                                                    });

                                                                                }
                                                                            }
                                                                        });
                                                                    }
                                                                }
                                                            });
                                                        }//TODO Manage the case no form found here
                                                    }
                                                });


                                                break;
                                            case 'recency_vl':

                                                options = {
                                                    url: "http://172.16.170.134:8080/openmrs/ws/rest/v1/form?q=" + tests.recency_vl.form + "&v=full",
                                                    headers: {
                                                        'Authorization': 'Basic ' + new Buffer("geoffrey:Ganyugxy1").toString('base64'),
                                                        'Content-Type': 'application/json'
                                                    }
                                                }

                                                //// 2. Form 
                                                request.get(options, function (error, response, body) {
                                                    if (error) {
                                                        console.log(error);
                                                        res.sendStatus(500);
                                                    } else {
                                                        var form = JSON.parse(body).results;
                                                        if (form && form.length > 0) {
                                                            form = _getTheGoodResult(form, "display", tests.recency_vl.form);

                                                            options = {
                                                                url: "http://172.16.170.134:8080/openmrs/ws/rest/v1/concept?q=" + tests.recency_vl.q + "&v=full",
                                                                headers: {
                                                                    'Authorization': 'Basic ' + new Buffer("geoffrey:Ganyugxy1").toString('base64'),
                                                                    'Content-Type': 'application/json'
                                                                }
                                                            }

                                                            //// 3. Get the RECENCY concepts list
                                                            request.get(options, function (error, response, body) {
                                                                if (error) {
                                                                    console.log(error);
                                                                    res.sendStatus(500);
                                                                } else {
                                                                    var recencies = JSON.parse(body).results;
                                                                    if (recencies && recencies.length > 0) {
                                                                        var recencyAssayResultConcept = _getTheGoodResult(recencies, "display", tests.recency_vl.recencyAssayResultConcept)
                                                                        var recencyAssayTestConcept = _getTheGoodResult(recencies, "display", tests.recency_vl.recencyAssayTestConcept)
                                                                        var recencyViralLoadResultConcept = _getTheGoodResult(recencies, "display", tests.recency_vl.recencyViralLoadResultConcept)
                                                                        var recencyViralLoadTestDateConcept = _getTheGoodResult(recencies, "display", tests.recency_vl.recencyViralLoadTestDateConcept)


                                                                        options = {
                                                                            url: "http://172.16.170.134:8080/openmrs/ws/rest/v1/visittype",
                                                                            headers: {
                                                                                'Authorization': 'Basic ' + new Buffer("geoffrey:Ganyugxy1").toString('base64'),
                                                                                'Content-Type': 'application/json'
                                                                            }
                                                                        }
                                                                        //// 4. Get the VISIT TYPE 
                                                                        request.get(options, function (error, response, body) {
                                                                            if (error) {
                                                                                console.log(error);
                                                                                res.sendStatus(500)
                                                                            } else {
                                                                                var visittype = JSON.parse(body).results;
                                                                                if (visittype && visittype.length > 0) {
                                                                                    visittype = _getTheGoodResult(visittype, "display", tests.recency_vl.visitType)


                                                                                    var encounterOptions = {
                                                                                        url: "http://172.16.170.134:8080/openmrs/ws/rest/v1/encounter",
                                                                                        body: JSON.stringify(
                                                                                                {
                                                                                                    "encounterDatetime": (new Date(data.SampleDate)).toISOString(),
                                                                                                    "patient": patient.uuid,
                                                                                                    "location": locations.l_448,
                                                                                                    "form": form.uuid,
                                                                                                    "encounterType": form.encounterType.uuid,
                                                                                                    "obs": [
                                                                                                        {
                                                                                                            "concept": recencyAssayResultConcept.uuid,
                                                                                                            "person": patient.uuid,
                                                                                                            "obsDatetime": (new Date()).toISOString(), //TODO
                                                                                                            "location": locations.l_448,
                                                                                                            "voided": false,
                                                                                                            "value": {
                                                                                                                "uuid": "fb3b2a61-4f4b-46b2-9187-9ec769349a44" //TODO
                                                                                                            }
                                                                                                        },
                                                                                                        {
                                                                                                            "concept": recencyAssayTestConcept.uuid,
                                                                                                            "person": patient.uuid,
                                                                                                            "obsDatetime": (new Date()).toISOString(), //TODO
                                                                                                            "location": locations.l_448,
                                                                                                            "voided": false,
                                                                                                            "value": {
                                                                                                                "uuid": "3cd6f600-26fe-102b-80cb-0017a47871b2" //TODO
                                                                                                            },
                                                                                                            "resourceVersion": "1.8"
                                                                                                        },
                                                                                                        {
                                                                                                            "concept": recencyViralLoadResultConcept.uuid,
                                                                                                            "person": patient.uuid,
                                                                                                            "obsDatetime": (new Date()).toISOString(), //TODO
                                                                                                            "location": locations.l_448,
                                                                                                            "voided": false,
                                                                                                            "value": data.Result.copies,
                                                                                                            "resourceVersion": "1.8"
                                                                                                        },
                                                                                                        {
                                                                                                            "concept": recencyViralLoadTestDateConcept.uuid,
                                                                                                            "person": patient.uuid,
                                                                                                            "obsDatetime": (new Date()).toISOString(), //TODO
                                                                                                            "location": locations.l_448,
                                                                                                            "voided": false,
                                                                                                            "value": (new Date(data.DateReleased)).toISOString(),
                                                                                                        }
                                                                                                    ],
                                                                                                    "visit": {
                                                                                                        //"uuid": "db00fbc6-d100-44df-87f0-425f176152c4",
                                                                                                        "patient": patient.uuid,
                                                                                                        "visitType": visittype.uuid,
                                                                                                        "location": locations.l_448,
                                                                                                        "startDatetime": (new Date(data.DateSampleReceived)).toISOString()//DATE OF THE VISIT IMPORTANT TO CREATE NEW VISIT. We need to have the date of the visit
                                                                                                    },
                                                                                                    "encounterProviders": [{
                                                                                                            "encounterRole": "a0b03050-c99b-11e0-9572-0800200c9a66",
                                                                                                            "provider": "prov877f-b5c3-4546-a1b1-533270e04721",
                                                                                                            "resourceVersion": "1.9"
                                                                                                        }],
                                                                                                    "resourceVersion": "1.9"
                                                                                                }
                                                                                        ),
                                                                                        headers: {
                                                                                            'Authorization': 'Basic ' + new Buffer("geoffrey:Ganyugxy1").toString('base64'),
                                                                                            'Content-Type': 'application/json'
                                                                                        }
                                                                                    };

                                                                                    request.post(encounterOptions, function (error, response, body) {
                                                                                        if (error) {
                                                                                            console.log(error);
                                                                                            res.sendStatus(500)
                                                                                        } else {
                                                                                            console.log('statusCode:', response && response.statusCode);
                                                                                            console.log('body:', body);
                                                                                            res.sendStatus(response.statusCode);
                                                                                        }
                                                                                    });




                                                                                }
                                                                            }
                                                                        });


                                                                    }
                                                                }
                                                            });
                                                        }//TODO Manage the case no form found here
                                                    }
                                                });

                                                break;
                                            case 'hiv_recency':
                                                //TODO
                                                res.sendStatus(200)
                                                break;
                                        }//END Switch
                                    } else if (results && results.length == 0) {//No result found
                                        if (nd_of_research < 2) {//Second research possible by name 
                                            console.log(">>> Searching by name: " + data.firstName + " " + data.lastName);
                                            LoopA(data.firstName + " " + data.lastName);
                                        } else {
                                            console.log(">>> No patient found in OpenMRS: ");
                                            res.sendStatus(200);
                                        }
                                    } else {
                                        console.log(">>> Hoo, look like we have many candidtes with the input data, we are not able to take decision. ");
                                        //TODO in case we have many choice, log this case somewhere or save it in database.
                                        res.sendStatus(200);
                                    }
                                } else if (response.statusCode == "403") {
                                    console.log("FORBIDEN statusCode: ", response.statusCode)
                                    LoopA(data.tractnetID);//Search by TracknetID Firts
                                    res.sendStatus(200);
                                } else {
                                    console.log('statusCode:', response && response.statusCode); // Print the response status code if a response was received
                                    console.log('body:', body); // Print the HTML for the Google homepage.
                                    res.sendStatus(200);
                                }
                            }
                        });
                    } else {
                        if (nd_of_research < 2) {//Second research possible by name 
                            console.log(">>> Searching by name : " + data.firstName + " " + data.lastName);
                            LoopA(data.firstName + " " + data.lastName);
                        } else {
                            res.sendStatus(200);
                        }
                    }
                }
                console.log(">>>> Searching by tractnetID: " + data.tractnetID);
                LoopA(data.tractnetID);//Search by TracknetID Firts

//        needle
//          .post(apiConf.api.openMrsUrl , data, {})
//          .on('readable', function () {
//
//          })
//          .on('done', function (err, resp) {
//            console.log('Posted data',  data,  "to", apiConf.api.openMrsUrl );
//          })



            });
            //res.send(utils.buildReturnObject(mediatorConfig.urn, 'Successful', 200, headers, responseBody, orchestrations, properties))
        }
    })
    return app
}

/**
 * start - starts the mediator
 *
 * @param  {Function} callback a node style callback that is called once the
 * server is started
 */
function start(callback) {
    if (apiConf.api.trustSelfSigned) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
    }

//  if (apiConf.register) {
    if (false) {
        medUtils.registerMediator(apiConf.api, mediatorConfig, (err) => {
            if (err) {
                winston.error('Failed to register this mediator, check your config')
                winston.error(err.stack)
                process.exit(1)
            }
            apiConf.api.urn = mediatorConfig.urn
            medUtils.fetchConfig(apiConf.api, (err, newConfig) => {
                winston.info('Received initial config:')
                winston.info(JSON.stringify(newConfig))
                config = newConfig
                if (err) {
                    winston.error('Failed to fetch initial config')
                    winston.error(err.stack)
                    process.exit(1)
                } else {
                    winston.info('Successfully registered mediator!')
                    let app = setupApp()
                    const server = app.listen(port, () => {
                        if (apiConf.heartbeat) {
                            let configEmitter = medUtils.activateHeartbeat(apiConf.api)
                            configEmitter.on('config', (newConfig) => {
                                winston.info('Received updated config:')
                                winston.info(JSON.stringify(newConfig))
                                // set new config for mediator
                                config = newConfig

                                // we can act on the new config received from the OpenHIM here
                                winston.info(config)
                            })
                        }
                        callback(server)
                    })
                }
            })
        })
    } else {
        // default to config from mediator registration
        config = mediatorConfig.config
        let app = setupApp()
        const server = app.listen(port, () => callback(server))
    }
}
exports.start = start

if (!module.parent) {
    // if this script is run directly, start the server
    start(() => winston.info(`Listening on ${port}...`))
}
