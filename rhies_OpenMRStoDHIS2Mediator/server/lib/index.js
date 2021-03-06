#!/usr/bin/env node
'use strict'


const formidable = require('formidable');
const express = require('express');
const medUtils = require('openhim-mediator-utils');
const winston = require('winston');
const _ = require('underscore');
const conceptGroupId = "95b7a6fc-57b1-45b9-a595-467f6118b51e";


var request = require('request');

const utils = require('./utils');
const formMapping = require('./formMapping');

const fs = require('fs');
const https = require('https');
const http = require('http');

// Logging setup
winston.remove(winston.transports.Console)
winston.add(winston.transports.Console, { level: 'info', timestamp: true, colorize: true })

// Config
var config = {} // this will vary depending on whats set in openhim-core
const apiConf = process.env.NODE_ENV === 'test' ? require('../config/test') : require('../config/config')
const mediatorConfig = require('../config/mediator')

var port = process.env.NODE_ENV === 'test' ? 7001 : mediatorConfig.endpoints[0].port

/**
 * setupApp - configures the http server for this mediator
 *
 * @return {express.App}  the configured http server
 */
function setupApp() {
  const app = express();


  var currenteLocation="";

  function reportEndOfProcess(req, res, error, statusCode, message) {
    res.set('Content-Type', 'application/json+openhim')
    var responseBody = "[" + currenteLocation + "] " +  message;
    var stateLabel = "";
    let orchestrations = [];

    var headers = { 'content-type': 'application/json' }
    if (error) {
      stateLabel = "Failed";
      winston.error(message, error);
    } else {
      stateLabel = "Successful";
      winston.info(message);
    }
    var orchestrationResponse = { statusCode: statusCode, headers: headers }
    orchestrations.push(utils.buildOrchestration('Primary Route', new Date().getTime(), req.method, req.url, req.headers, req.body, orchestrationResponse, responseBody))
    res.send(utils.buildReturnObject(mediatorConfig.urn, stateLabel, statusCode, headers, responseBody, orchestrations, { property: 'Primary Route' }));
  }

  app.all('*', (req, res) => {
    winston.info(`Processing ${req.method} request on ${req.url}`)
    if (req.method == 'POST' && req.url == apiConf.api.urlPattern) {
      var form = new formidable.IncomingForm();
      form.parse(req, function (err, fields, files) {
        var data = fields;

        winston.info('Encounter received ...')

        if (apiConf.verbose == true) {
          if (utils.isFineValue(fields) == true && utils.isFineValue(fields.encounter) == true && utils.isFineValue(fields.encounter.obs) == true) {
            //console.log("--> Received encounter obs: ", JSON.stringify(fields.encounter.obs));
          } else {
            if (utils.isFineValue(fields) == true && utils.isFineValue(fields.encounter) == true) {
              console.log("--> Received encounter: ", JSON.stringify(fields.encounter));
            } else {
              console.log("--> Received data: ", JSON.stringify(fields));
            }
          }
        }

        if (apiConf.verbose == true) {
          //console.log("--> Patient: ", JSON.stringify(fields.patient));
        }

        //get DHIS2 Lab id with FOSA code
        currenteLocation=fields.location.description;
        getOrganizationUnit(fields, function (error, organizationUnit) {
          if (error) {
            reportEndOfProcess(req, res, error, 500, 'error while retrieving for organization unit ...');
          } else {
            //Create or update entity instance
            upsertEntity(fields, organizationUnit, function (error, trackedEntityInstanceId) {
              if (error) {
                reportEndOfProcess(req, res, error, 500, 'error while upserting entity instance id ...');
              } else {
                //Enroll entity instance
                enrolleEntity(fields, organizationUnit, trackedEntityInstanceId, function (error, enrollmentId) {
                  if (error) {
                    reportEndOfProcess(req, res, error, 500, 'error while enrolling entity instance id ');
                  } else {
                    //send incoming form
                    if (utils.isFineValue(fields.encounter.form) == true && utils.isFineValue(fields.encounter.form.display) == true) {
                      winston.info('Adding a new ', fields.encounter.form.display.trim());
                      if (fields.encounter.form.display.trim().toUpperCase() == apiConf.CaseBaseForme.trim().toUpperCase()) {
                        addHivCaseBaseSurveillance(fields, organizationUnit, trackedEntityInstanceId, enrollmentId, function (error, resp) {
                          if (error) {
                            reportEndOfProcess(req, res, error, 500, 'error while adding ' + fields.encounter.form.display.trim());
                          } else {
                            reportEndOfProcess(req, res, null, 200, fields.encounter.form.display.trim() + ' added with success');
                          }
                        })
                      }

                      if (fields.encounter.form.display.trim().toUpperCase() == apiConf.enrollmentForm.trim().toUpperCase()) {
                        addHivCrfSection1(fields, organizationUnit, trackedEntityInstanceId, enrollmentId, function (error, resp) {
                          if (error) {
                            reportEndOfProcess(req, res, error, 500, 'error while adding ' + fields.encounter.form.display.trim());
                          } else {
                            reportEndOfProcess(req, res, null, 200, fields.encounter.form.display.trim() + ' added with success');
                          }
                        })
                      }

                      if (fields.encounter.form.display.trim().toUpperCase() == apiConf.followupForm.trim().toUpperCase()) {
                        addHivCrfSection2(fields, organizationUnit, trackedEntityInstanceId, enrollmentId, function (error, resp) {
                          if (error) {
                            reportEndOfProcess(req, res, error, 500, 'error while adding ' + fields.encounter.form.display.trim());
                          } else {
                            reportEndOfProcess(req, res, null, 200, fields.encounter.form.display.trim() + ' added with success');
                          }
                        })
                      }

                      if (fields.encounter.form.display.trim().toUpperCase() == apiConf.recencyVLForm.trim().toUpperCase()) {
                        addRecencyVL(fields, organizationUnit, trackedEntityInstanceId, enrollmentId, function (error, resp) {
                          if (error) {
                            reportEndOfProcess(req, res, error, 500, 'error while adding ' + fields.encounter.form.display.trim());
                          } else {
                            reportEndOfProcess(req, res, null, 200, fields.encounter.form.display.trim() + ' added with success');
                          }
                        })
                      }

                      if (fields.encounter.form.display.trim().toUpperCase() == apiConf.cbsContactForm.trim().toUpperCase()) {
                        addCbsContactInformation(fields, organizationUnit, trackedEntityInstanceId, enrollmentId, function (error, resp) {
                          if (error) {
                            reportEndOfProcess(req, res, error, 500, 'error while adding ' + fields.encounter.form.display.trim());
                          } else {
                            reportEndOfProcess(req, res, null, 200, fields.encounter.form.display.trim() + ' added with success');
                          }
                        })
                      }

                    } else {
                      reportEndOfProcess(req, res, " ", 500, 'It is not possible to get the incoming form with the data received from OpenMRS');
                    }
                  }
                })
              }
            });
          }
        });
      })
    }
    if (req.protocol === 'http'){
      res.redirect(301, `https://${req.headers.post}${req.url}`);
    }
  });
  return app
}



var upsertEntity = function (fields, organizationUnit, callback) {

  if (utils.isFineValue(fields) == true && utils.isFineValue(fields.patient) == true) {

    var patient = fields.patient;

    if (utils.isFineValue(patient) == true && utils.isFineValue(patient.identifiers) == true) {

      //getting OpenMRS patient TRACNetId and  UPId
      getOpenMRSPatientIDs(fields, function (UPId, TRACNetId) {
        if (utils.isFineValue(TRACNetId) == true || utils.isFineValue(UPId) == true) {

          //Create patient existance
          var patientInstance = {
            "trackedEntity": "fHNKuROvJEc",
            "orgUnit": organizationUnit,
            "attributes": [
              {
                "attribute": "QdxWgPBlRxt",
                "value": UPId
              },
              {
                "attribute": "ISfxedlVq7Y",
                "value": "1900-01-01"
              },
              {
                "attribute": "zxrhIBj6H5K",
                "value": TRACNetId
              }
            ]
          }

          //Query with UPID or TRACNetId 
          getTrackedEntity(organizationUnit, UPId, TRACNetId, function (error, resp) {
            if (error) {
              callback(error);
            } else {
              if (utils.isFineValue(resp) == true) {
                //A tracked entity instance found, updating ...

                if (fields.encounter.form.display.trim().toUpperCase() == apiConf.CaseBaseForme.trim().toUpperCase()) {
                  // if received encounter have the right ISfxedlVq7Y (start of ARV) , we replace
                  // or we take what is on resp.trackedEntityInstance
                  formMapping.getEntityInstanceDates(fields.encounter, "a84ccc24-fd81-4e18-ba82-5a785c2f86bc",'1900-01-01', function (result) {

                    if (utils.isFineValue(result) == true) {
                      patientInstance.attributes[1].value = result;
                    }

                    var options = {
                      url: apiConf.api.dhis2.url + "/api/trackedEntityInstances/" + resp.trackedEntityInstance,
                      headers: {
                        'Authorization': 'Basic ' + new Buffer(apiConf.api.dhis2.user.name + ":" + apiConf.api.dhis2.user.pwd).toString('base64'),
                        'Content-Type': 'application/json'
                      },
                      body: JSON.stringify(patientInstance),
                    };

                    winston.info('1- Updating Entity instance ...')
                    request.put(options, function (error, response, body) {
                      if (error) {
                        callback(error);
                      } else {
                        var ResponseBody = JSON.parse(body);
                        if (utils.isFineValue(ResponseBody) == true) {
                          if (ResponseBody.httpStatusCode == 200) {
                            winston.info('1- Entity instance ', resp.trackedEntityInstance, ' updated with success ', ResponseBody.httpStatusCode, ResponseBody.message)
                            callback(null, resp.trackedEntityInstance);
                          } else {
                            if (utils.isFineValue(ResponseBody) == true && utils.isFineValue(ResponseBody.response) == true && utils.isFineValue(ResponseBody.response.importSummaries) == true) {
                              callback("1- An error occured when trying to update an entity instance", ResponseBody.response.importSummaries[0].conflicts);
                            } else {
                              winston.error('1- An error occured when trying to update an entity instance ', ResponseBody.httpStatusCode, body.message)
                              callback('1- An error occured when trying to update an entity instance ' + ResponseBody.message);
                            }
                          }
                        } else {
                          callback('1- An error occured, the server returned an empty response when updating an entity instance');
                        }
                      }
                    });

                  });
                } else {

                  //update a patient without updating the date of ARV
                  patientInstance.attributes[1].value = '1900-01-01';

                  var options = {
                    url: apiConf.api.dhis2.url + "/api/trackedEntityInstances/" + resp.trackedEntityInstance,
                    headers: {
                      'Authorization': 'Basic ' + new Buffer(apiConf.api.dhis2.user.name + ":" + apiConf.api.dhis2.user.pwd).toString('base64'),
                      'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(patientInstance),
                  };

                  winston.info('2- Updating Entity instance ...')
                  request.put(options, function (error, response, body) {
                    if (error) {
                      callback(error);
                    } else {
                      var ResponseBody = JSON.parse(body);
                      if (utils.isFineValue(ResponseBody) == true) {
                        if (ResponseBody.httpStatusCode == 200) {
                          winston.info('2- Entity instance ', resp.trackedEntityInstance, ' updated with success ', ResponseBody.httpStatusCode, ResponseBody.message)
                          callback(null, resp.trackedEntityInstance);
                        } else {
                          if (utils.isFineValue(ResponseBody) == true && utils.isFineValue(ResponseBody.response) == true && utils.isFineValue(ResponseBody.response.importSummaries) == true) {
                            callback("2- An error occured when trying to update an entity instance", ResponseBody.response.importSummaries[0].conflicts);
                          } else {
                            winston.error('2- An error occured when trying to update an entity instance ', ResponseBody.httpStatusCode, body.message)
                            callback('2- An error occured when trying to update an entity instance ' + ResponseBody.message);
                          }
                        }
                      } else {
                        callback('2- An error occured, the server returned an empty response when updating an entity instance');
                      }
                    }
                  });

                }

              } else {

                //No tracked entity instance found, creating...
                if (fields.encounter.form.display.trim().toUpperCase() == apiConf.CaseBaseForme.trim().toUpperCase()) {
                  // if received encounter have the right (start of ARV), we replace
                  // or we let like this
                  formMapping.getEntityInstanceDates(fields.encounter, "a84ccc24-fd81-4e18-ba82-5a785c2f86bc", '1900-01-01', function (result) {

                    if (utils.isFineValue(result) == true) {
                      patientInstance.attributes[1].value = result;
                    }

                    var options = {
                      url: apiConf.api.dhis2.url + "/api/trackedEntityInstances",
                      headers: {
                        'Authorization': 'Basic ' + new Buffer(apiConf.api.dhis2.user.name + ":" + apiConf.api.dhis2.user.pwd).toString('base64'),
                        'Content-Type': 'application/json'
                      },
                      body: JSON.stringify(patientInstance),
                    };

                    winston.info('1- Creating Entity instance ...')
                    request.post(options, function (error, response, body) {
                      if (error) {
                        callback(error);
                      } else {
                        var ResponseBody = JSON.parse(body);

                        if (utils.isFineValue(ResponseBody) == true && utils.isFineValue(ResponseBody.httpStatusCode) == true) {
                          if (ResponseBody.httpStatusCode == 200) {
                            winston.info('1- Entity instance ', ResponseBody.response.importSummaries[0].reference, ' created with success ', ResponseBody.httpStatusCode, ResponseBody.message)
                            callback(null, ResponseBody.response.importSummaries[0].reference);
                          } else {
                            if (utils.isFineValue(ResponseBody) == true && utils.isFineValue(ResponseBody.response) == true && utils.isFineValue(ResponseBody.response.importSummaries) == true) {
                              callback("1- An error occured when trying to create an entity instance", ResponseBody.response.importSummaries[0].conflicts);
                            } else {
                              winston.error('An error occured when trying to create an entity instance ', ResponseBody.httpStatusCode, body.message)
                              callback('1- An error occured when trying to create an entity instance ' + ResponseBody.message);
                            }
                          }
                        } else {
                          callback('1- An error occured, the server returned an empty body when creating an entity instance');
                        }
                      }
                    });
                  });


                } else {


                  var options = {
                    url: apiConf.api.dhis2.url + "/api/trackedEntityInstances",
                    headers: {
                      'Authorization': 'Basic ' + new Buffer(apiConf.api.dhis2.user.name + ":" + apiConf.api.dhis2.user.pwd).toString('base64'),
                      'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(patientInstance),
                  };

                  winston.info('2- Creating Entity instance ...')
                  request.post(options, function (error, response, body) {
                    if (error) {
                      callback(error);
                    } else {
                      var ResponseBody = JSON.parse(body);

                      if (utils.isFineValue(ResponseBody) == true && utils.isFineValue(ResponseBody.httpStatusCode) == true) {
                        if (ResponseBody.httpStatusCode == 200) {
                          winston.info('2- Entity instance ', ResponseBody.response.importSummaries[0].reference, ' created with success ', ResponseBody.httpStatusCode, ResponseBody.message)
                          callback(null, ResponseBody.response.importSummaries[0].reference);
                        } else {
                          if (utils.isFineValue(ResponseBody) == true && utils.isFineValue(ResponseBody.response) == true && utils.isFineValue(ResponseBody.response.importSummaries) == true) {
                            callback("2- An error occured when trying to create an entity instance", ResponseBody.response.importSummaries[0].conflicts);
                          } else {
                            winston.error('2- An error occured when trying to create an entity instance ', ResponseBody.httpStatusCode, body.message)
                            callback('2- An error occured when trying to create an entity instance ' + ResponseBody.message);
                          }
                        }
                      } else {
                        callback('2- An error occured, the server returned an empty body when creating an entity instance');
                      }
                    }
                  });

                }
              }
            }
          });
        } else {
          winston.error('Patient with no UPID and no TRACNet Id received from OpenMRS.')
          callback('Patient with no UPID and no TRACNet Id received from OpenMRS.');
        }
      });

    } else {
      winston.error('Empty patient information received from OpenMRS.')
      callback('Empty patient information received from OpenMRS.');
    }
  }
}

var getOpenMRSPatientIDs = function (fields, callback) {
  if (utils.isFineValue(fields) == true && utils.isFineValue(fields.patient) == true) {
    var patient = fields.patient;
    if (utils.isFineValue(patient) == true && utils.isFineValue(patient.identifiers) == true) {
      var identifiers = patient.identifiers;
      var TRACNetId = null;
      var UPId = null;

      for (var i = 0; i < patient.identifiers.length; i++) {
        if (utils.isFineValue(patient.identifiers[i]) == true && utils.isFineValue(patient.identifiers[i].display) == true) {
          if (patient.identifiers[i].display.toUpperCase().includes("UPID".toUpperCase()) == true) {
            UPId = patient.identifiers[i].display.split("=")[1].trim();
          }
          if (patient.identifiers[i].display.toUpperCase().includes("TRACNet".toUpperCase()) == true) {
            TRACNetId = patient.identifiers[i].display.split("=")[1].trim();
          }
        }
      }
      callback(UPId, TRACNetId);
    } else {
      callback(null, null);
    }
  } else {
    callback(null, null);
  }
}

var getTrackedEntity = function (organizationUnit, UPId, TRACNetId, callback) {
  var UPIdOptions = {};
  var TRACNetIdOptions = {};

  if (utils.isFineValue(UPId) == true && utils.isFineValue(organizationUnit) == true) {
    UPIdOptions = {
      url: apiConf.api.dhis2.url + "/api/trackedEntityInstances.json?filter=QdxWgPBlRxt:EQ:" + UPId + "&ou=" + organizationUnit,
      headers: {
        'Authorization': 'Basic ' + new Buffer(apiConf.api.dhis2.user.name + ":" + apiConf.api.dhis2.user.pwd).toString('base64'),
        'Content-Type': 'application/json'
      }
    };
  }

  if (utils.isFineValue(TRACNetId) == true && utils.isFineValue(organizationUnit) == true) {
    TRACNetIdOptions = {
      url: apiConf.api.dhis2.url + "/api/trackedEntityInstances.json?filter=zxrhIBj6H5K:EQ:" + TRACNetId + "&ou=" + organizationUnit,
      headers: {
        'Authorization': 'Basic ' + new Buffer(apiConf.api.dhis2.user.name + ":" + apiConf.api.dhis2.user.pwd).toString('base64'),
        'Content-Type': 'application/json'
      }
    };
  }

  if (utils.isFineValue(UPIdOptions) == true) {
    winston.info('Checking tracked entity instance with UPID ', UPId);
    request.get(UPIdOptions, function (error, response, body) {
      if (error) {
        callback(error);
      } else {
        var resp = JSON.parse(body);
        if (utils.isFineValue(resp.trackedEntityInstances) == true) {
          winston.info('Tracked entity instance retrieved with success');
          callback(null, resp.trackedEntityInstances[0]);
        } else {
          winston.info('No tracked entity instance found with UPID ', UPId);
          if (utils.isFineValue(TRACNetIdOptions) == true) {
            winston.info('Checking tracked entity instance with TRACNet id ', TRACNetId);
            request.get(TRACNetIdOptions, function (error, response, body) {
              if (error) {
                callback(error);
              } else {
                var resp = JSON.parse(body);
                if (utils.isFineValue(resp.trackedEntityInstances) == true) {
                  callback(null, resp.trackedEntityInstances[0]);
                } else {
                  winston.info('No tracked entity instance found with TRACNet ID ', TRACNetId);
                  callback(null, null);
                }
              }
            });
          } else {
            winston.info('No TRACNetId available.');
            callback(null, null);
          }
        }
      }
    });
  } else {
    winston.info('No UPID available.');
    if (utils.isFineValue(TRACNetIdOptions) == true) {
      winston.info('Checking tracked entity instance with TRACNet id ', TRACNetId);
      request.get(TRACNetIdOptions, function (error, response, body) {
        if (error) {
          callback(error);
        } else {
          var resp = JSON.parse(body);
          if (utils.isFineValue(resp.trackedEntityInstances) == true) {
            winston.info('Tracked entity instance retrieved with success');
            callback(null, resp.trackedEntityInstances[0]);
          } else {
            winston.info('No tracked entity instance found with TRACNet ID ', TRACNetId);
            callback(null, null);
          }
        }
      });
    } else {
      winston.info('No TRACNet id available.');
      callback(null, null);
    }
  }
}

var getOrganizationUnit = function (fields, callback) {
  if (utils.isFineValue(fields) == true && utils.isFineValue(fields.location) == true && utils.isFineValue(fields.location.description) == true) {
    if (utils.isFineValue(fields.location.description) == true && fields.location.description.includes(":") == true) {

      //FOSAID: 448 TYPE: CS
      var labFosaId = fields.location.description.split(":")[1].trim().split(" ")[0].trim();
      console.log(fields.location.description);
      console.log(fields.location.description.split(":")[1].trim());
      console.log(fields.location.description.split(":")[1].trim().split(" ")[0].trim());
      winston.info('Getting DHIS2 organizationUnit with location fosa id ', labFosaId)
      var options = {
        url: apiConf.api.dhis2.url + "/api/organisationUnits.json?fields=id&&filter=code:eq:" + labFosaId,
        headers: {
          'Authorization': 'Basic ' + new Buffer(apiConf.api.dhis2.user.name + ":" + apiConf.api.dhis2.user.pwd).toString('base64'),
          'Content-Type': 'application/json'
        }
      };

      request.get(options, function (error, response, body) {
        if (error) {
          callback(error);
        } else {
          var organizationUnit = JSON.parse(body);
          if (utils.isFineValue(organizationUnit) == true && utils.isFineValue(organizationUnit.organisationUnits) == true) {
            callback(null, organizationUnit.organisationUnits[0].id);
          } else {
            callback('Server returned an empty response when retrieving organization unit ', labFosaId);
          }
        }
      });

    } else {
      winston.error('Wrong fosa code provided for the location ' + fields.location.display)
      callback('Wrong fosa code provided for the location ' + fields.location.display)
    }
  } else {
    winston.error('Empty location information received from OpenMRS.')
    callback('Empty location information received from OpenMRS.');
  }
}

var getEnrollment = function (organizationUnit, trackedEntityInstanceId, callback) {
  var Options = {
    url: apiConf.api.dhis2.url + "/api/enrollments.json?ou=" + organizationUnit + "&trackedEntityInstance=" + trackedEntityInstanceId,
    headers: {
      'Authorization': 'Basic ' + new Buffer(apiConf.api.dhis2.user.name + ":" + apiConf.api.dhis2.user.pwd).toString('base64'),
      'Content-Type': 'application/json'
    }
  };
  if (utils.isFineValue(organizationUnit) == true && utils.isFineValue(trackedEntityInstanceId) == true) {
    winston.info('Checking for enrollment with organizationUnit ', organizationUnit, 'and trackedEntityInstance ', trackedEntityInstanceId);
    request.get(Options, function (error, response, body) {
      if (error) {
        callback(error);
      } else {
        var resp = JSON.parse(body);
        if (utils.isFineValue(resp) == true) {
          if (utils.isFineValue(resp.enrollments) == true) {
            winston.info('Enrollment retrieved with success');
            callback(null, resp.enrollments[0]);
          } else {
            winston.info('No enrollment found for this tracked instance id.');
            callback(null, null);
          }
        } else {
          winston.info('No enrollment found found for tracked entity Instance Id ', trackedEntityInstanceId);
          callback('No enrollment found found for tracked entity Instance Id ', trackedEntityInstanceId, null);
        }
      }
    });
  } else {
    winston.info('Organization unit or tracked entity instance not provided.');
    callback('Organization unit or tracked entity instance not provided.', null);
  }
}

var enrolleEntity = function (fields, organizationUnit, trackedEntityInstanceId, callback) {
  getEnrollment(organizationUnit, trackedEntityInstanceId, function (error, resp) {
    if (error) {
      winston.error('error while enrolling entity instance id ...', error);
    } else {
      var enrollementValue = {
        "trackedEntityInstance": trackedEntityInstanceId,
        "orgUnit": organizationUnit,
        "program": "CYyICYiO5zo",
        "enrollmentDate": "2000-01-01",
        "incidentDate": "2000-01-01"
      }

      if (utils.isFineValue(resp) == true) {

        if (fields.encounter.form.display.trim().toUpperCase() == apiConf.CaseBaseForme.trim().toUpperCase()) {
          // if received encounter have the right ijTurgFUOPq (start of ARV) , we replace
          // or we take what is on resp.trackedEntityInstance
          formMapping.getEntityInstanceDates(fields.encounter, "badacf97-0970-4dde-aee4-5e1c2bb125f7", '2000-01-01', function (result) {

            if (utils.isFineValue(result) == true) {
              enrollementValue.enrollmentDate = result;
              enrollementValue.incidentDate = result;

            } 


            var options = {
              url: apiConf.api.dhis2.url + "/api/enrollments/" + resp.enrollment,
              headers: {
                'Authorization': 'Basic ' + new Buffer(apiConf.api.dhis2.user.name + ":" + apiConf.api.dhis2.user.pwd).toString('base64'),
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(enrollementValue),
            };

            winston.info('Updating enrollment ...')
            request.put(options, function (error, response, body) {
              if (error) {
                callback(error);
              } else {
                var ResponseBody = JSON.parse(body);
                if (utils.isFineValue(ResponseBody) == true) {
                  if (ResponseBody.httpStatusCode == 200) {
                    winston.info('Enrollment ', resp.enrollment, ' done with success ', ResponseBody.httpStatusCode, ResponseBody.message)
                    callback(null, resp.enrollment);
                  } else {
                    if (utils.isFineValue(ResponseBody) == true && utils.isFineValue(ResponseBody.response) == true && utils.isFineValue(ResponseBody.response.importSummaries) == true) {
                      callback("An error occured when trying to update an Enrollment", ResponseBody.response.importSummaries[0].conflicts);
                    } else {
                      winston.error('An error occured when trying to update an Enrollment ', ResponseBody.httpStatusCode, body.message)
                      callback('An error occured when trying to update an Enrollment ' + ResponseBody.message);
                    }
                  }
                } else {
                  callback('An error occured, the server returned an empty response when updating an Enrollment');
                }
              }
            });
          });
        } else {

          enrollementValue.enrollmentDate = resp.enrollmentDate;
          var options = {
            url: apiConf.api.dhis2.url + "/api/enrollments/" + resp.enrollment,
            headers: {
              'Authorization': 'Basic ' + new Buffer(apiConf.api.dhis2.user.name + ":" + apiConf.api.dhis2.user.pwd).toString('base64'),
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(enrollementValue),
          };

          winston.info('1- Updating enrollment ...')
          request.put(options, function (error, response, body) {
            if (error) {
              callback(error);
            } else {
              var ResponseBody = JSON.parse(body);
              if (utils.isFineValue(ResponseBody) == true) {
                if (ResponseBody.httpStatusCode == 200) {
                  winston.info('1- Enrollment ', resp.enrollment, ' done with success ', ResponseBody.httpStatusCode, ResponseBody.message)
                  callback(null, resp.enrollment);
                } else {
                  if (utils.isFineValue(ResponseBody) == true && utils.isFineValue(ResponseBody.response) == true && utils.isFineValue(ResponseBody.response.importSummaries) == true) {
                    callback("1- An error occured when trying to update an Enrollment", ResponseBody.response.importSummaries[0].conflicts);
                  } else {
                    winston.error('1- An error occured when trying to update an Enrollment ', ResponseBody.httpStatusCode, body.message)
                    callback('1- An error occured when trying to update an Enrollment ' + ResponseBody.message);
                  }
                }
              } else {
                callback('1- An error occured, the server returned an empty response when updating an Enrollment');
              }
            }
          });

        }
      } else {
        if (fields.encounter.form.display.trim().toUpperCase() == apiConf.CaseBaseForme.trim().toUpperCase()) {
          // if received encounter have the right enrollmentDate and incidentDate , we replace
          //or we let like this
          formMapping.getEntityInstanceDates(fields.encounter, "badacf97-0970-4dde-aee4-5e1c2bb125f7", '2000-01-01', function (result) {

            if (utils.isFineValue(result) == true) {
              enrollementValue.enrollmentDate = result;
              enrollementValue.incidentDate = result;

            } 

            var options = {
              url: apiConf.api.dhis2.url + "/api/enrollments",
              headers: {
                'Authorization': 'Basic ' + new Buffer(apiConf.api.dhis2.user.name + ":" + apiConf.api.dhis2.user.pwd).toString('base64'),
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(enrollementValue),
            };

            winston.info('Creating enrollment ...')
            request.post(options, function (error, response, body) {
              if (error) {
                callback(error);
              } else {

                var ResponseBody = JSON.parse(body);
                if (utils.isFineValue(ResponseBody) == true && utils.isFineValue(ResponseBody.httpStatusCode) == true) {
                  if (ResponseBody.httpStatusCode == 200) {
                    winston.info('Enrollment ', ResponseBody.response.importSummaries[0].reference, ' done with success ', ResponseBody.httpStatusCode, ResponseBody.message)
                    callback(null, ResponseBody.response.importSummaries[0].reference);
                  } else {

                    if (utils.isFineValue(ResponseBody) == true && utils.isFineValue(ResponseBody.response) == true && utils.isFineValue(ResponseBody.response.importSummaries) == true) {
                      callback("An error occured when trying to create an enrollment ", ResponseBody.response.importSummaries[0].conflicts);
                    } else {
                      winston.error('An error occured when trying to create an enrollment ', ResponseBody.httpStatusCode, body.message)
                      callback('An error occured when trying to create an enrollment ' + ResponseBody.message);
                    }
                  }
                } else {
                  callback('An error occured, the server returned an empty body when creating an enrollment');
                }
              }
            });
          });
        } else {


          var options = {
            url: apiConf.api.dhis2.url + "/api/enrollments",
            headers: {
              'Authorization': 'Basic ' + new Buffer(apiConf.api.dhis2.user.name + ":" + apiConf.api.dhis2.user.pwd).toString('base64'),
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(enrollementValue),
          };

          winston.info('2- Creating enrollment ...')
          request.post(options, function (error, response, body) {
            if (error) {
              callback(error);
            } else {

              var ResponseBody = JSON.parse(body);
              if (utils.isFineValue(ResponseBody) == true && utils.isFineValue(ResponseBody.httpStatusCode) == true) {
                if (ResponseBody.httpStatusCode == 200) {
                  winston.info('2- Enrollment ', ResponseBody.response.importSummaries[0].reference, ' done with success ', ResponseBody.httpStatusCode, ResponseBody.message)
                  callback(null, ResponseBody.response.importSummaries[0].reference);
                } else {
                  if (utils.isFineValue(ResponseBody) == true && utils.isFineValue(ResponseBody.response) == true && utils.isFineValue(ResponseBody.response.importSummaries) == true) {
                    callback("2- An error occured when trying to create an enrollment ", ResponseBody.response.importSummaries[0].conflicts);
                  } else {
                    winston.error('2- An error occured when trying to create an enrollment ', ResponseBody.httpStatusCode, body.message)
                    callback('2- An error occured when trying to create an enrollment ' + ResponseBody.message);
                  }
                }
              } else {
                callback('2- An error occured, the server returned an empty body when creating an enrollment');
              }
            }
          });



        }
      }
    }
  });
}




// Beginning of the CASE BASE SURVEILLANCE
var addHivCaseBaseSurveillance = function (incomingEncounter, organizationUnit, trackedEntityInstanceId, enrollmentId, callback) {
  //Declaration of all the variables for DHIS2 dropdown
  var patientRecencyAssayResultValue = "";
  var patientSampleRefSiteValue = ""
 
  //Reporting date in DHIS2 must be the encounterDate
  var eventDate = utils.convertToDate(incomingEncounter.encounter.encounterDatetime);
 
  //Retrieve the UUID for each dropdown concept from OpenMRS
  //Begining of UUID retrieving 
  var omrsRecencyAssayResult = utils.getConceptValue(incomingEncounter.encounter.obs, "b4b0e241-e41a-4d46-89dd-e531cf6d8202");
  if (utils.isFineValue(omrsRecencyAssayResult) == true && utils.isFineValue(omrsRecencyAssayResult.name) == true && utils.isFineValue(omrsRecencyAssayResult.name.name) == true) {
    omrsRecencyAssayResult = omrsRecencyAssayResult.uuid;
  } else {
    omrsRecencyAssayResult = "";
  }


  var omrsSampleRefSite = utils.getConceptValue(incomingEncounter.encounter.obs, "367b90c5-d5d9-4800-b467-69cedd7f9c24");
  if (utils.isFineValue(omrsSampleRefSite) == true && utils.isFineValue(omrsSampleRefSite.name) == true && utils.isFineValue(omrsSampleRefSite.name.name) == true) {
    omrsSampleRefSite = omrsSampleRefSite.uuid;
  } else {
    omrsSampleRefSite = "";
  }
  
  
  //Retrieving the matching value of the concept from DHIS2 for each dropdown
  //Biginning of the retrieving
  utils.getDhis2DropdownValue(utils.getDHIS2RecencyAssayResult(omrsRecencyAssayResult), function (result) {
    patientRecencyAssayResultValue = result;
    utils.getDhis2DropdownValue(utils.getSampleRefDHIS2Site(omrsSampleRefSite), function(result){
      patientSampleRefSiteValue = result;
    
  //End of retrieving of the the matching value of the concept from DHIS2 for each dropdown
                              
                              //1- sending createNewEventStageInfoRecencyContact
                              //DHIS2 Json payload updating before pushing
                              var dhsi2RecencyStructure = {
                                "program": "CYyICYiO5zo",
                                "orgUnit": organizationUnit,
                                "eventDate": eventDate,
                                "status": "COMPLETED",
                                "storedBy": "Savics",
                                "programStage": "r45yv7rwDEO",
                                "trackedEntityInstance": trackedEntityInstanceId,
                                "enrollment": enrollmentId,
                                "dataValues": [
                                  {
                                    "dataElement": "SNcELOKJCTs",
                                    "value": patientSampleRefSiteValue
                                  },
                                  {
                                    "dataElement": "K4l00GKVInN",
                                    "value": ""
                                  },
                                  {
                                    "dataElement": "W58gazENRqS",
                                    "value": patientRecencyAssayResultValue
                                  },
                                  {
                                    "dataElement": "xHo7COhyMKM",
                                    "value": ""
                                  },
                                  {
                                    "dataElement": "KX4MrpcRuAb",
                                    "value": ""
                                  },
                                  {
                                    "dataElement": "GyqLOJRotuL",
                                    "value": ""
                                  },
                                  {
                                    "dataElement": "FsbargPR5hR",
                                    "value": ""
                                  },
                                  {
                                    "dataElement": "buRJTweOy6h",
                                    "value": ""
                                  }
                                ]
                              }


                              winston.info('Adding recency contact information ...');
                              
                              //Beginning of Data pushing
                              formMapping.pushFormToDhis2(formMapping.form1MappingTable, incomingEncounter, dhsi2RecencyStructure, 1, formMapping.form1MappingBooleanTable, function (error, result) {
                                if (error) {
                                  winston.error('An error occured when trying to add a recency test information ', error);
                                  callback('An error occured when trying to add a recency test information');
                                } else {
                                  winston.info('Recency test information added with success ', result);
                                  callback(null, 'Recency test information added with success');
                                  
                                }
                              });
                
                           //End of data pushing
    
    
    
    });                      
  });
  

};
// End of the CASE BASE SURVEILLANCE


// Beginning of the CBS contact information Form
var addCbsContactInformation = function (incomingEncounter, organizationUnit, trackedEntityInstanceId, enrollmentId, callback) {
  
  //Declaration of all the variables for DHIS2 dropdown
  var patientRelationOfContactValue = "";
  var patientContactHivStatusValue = "";
  var patientRiskOfViolenceValue = "";
  var patientPlannedReferenceTypeValue = "";
  var patientContactInvitedValue = "";
  var patientContactReceivedValue = "";
  var patientReasonContactNotReceivedValue = "";
  var patientContactNotifierValue = "";
  var patientNotificationApproachValue = "";
  var patientContactTestedValue = "";
  var patientReasonContactNotTestedValue = ""; //This one must be modified in OpenMRS to dropdown, because it's free text
  var patientContactHivResultValue = "";
  var patientUntestedContactGivenTestKitValue = "";
  var patientContactGenderValue = "";
  var patientContactOnART = "";
  



  //Reporting date in DHIS2 must be the encounterDate
  var eventDate = utils.convertToDate(incomingEncounter.encounter.encounterDatetime);
  
  //Retrive non dropdown concept for CBS CONTACT GROUP ConvSet
  var patientCodeOfContactValue = utils.convertToNumber(utils.getContactGroupConceptValue(incomingEncounter.encounter.obs, "41c410a4-18a4-4221-98ad-1daf1b22de4d"));
  var patientAgeOfContactValue = utils.getCBSContactAge(incomingEncounter.encounter.obs);
  var patientContactHivPositifTrackedNumberValue = utils.getContactGroupConceptValue(incomingEncounter.encounter.obs, "0fbbc915-2550-4de8-93a0-1661ad7b45b8");
  var patientContactObservationsValue = utils.getContactGroupConceptValue(incomingEncounter.encounter.obs, "e328e0b0-28c3-44c9-9b2a-5f16b5185e2c");
  var patientContactUPIDValue = utils.getContactGroupConceptValue(incomingEncounter.encounter.obs, "a525a87f-b157-4599-b8e2-731896a9b7bc");

  var omrsContactOnART = utils.getContactGroupConceptValue(incomingEncounter.encounter.obs, "c1063a9d-515b-440a-af6a-89375cb44ca0");
  if (utils.isFineValue(omrsContactOnART) == true && utils.isFineValue(omrsContactOnART.name) == true && utils.isFineValue(omrsContactOnART.name.name) == true) {
    omrsContactOnART = omrsContactOnART.uuid;
  } else {
    omrsContactOnART = "";
  }


  var omrsRelationOfContact = utils.getContactGroupConceptValue(incomingEncounter.encounter.obs, "d4a45c62-5d82-43a2-856d-6c75db9fe842");
  if (utils.isFineValue(omrsRelationOfContact) == true && utils.isFineValue(omrsRelationOfContact.name) == true && utils.isFineValue(omrsRelationOfContact.name.name) == true) {
    omrsRelationOfContact = omrsRelationOfContact.uuid;
  } else {
    omrsRelationOfContact = "";
  }

  var omrsContactHivStatus = utils.getContactGroupConceptValue(incomingEncounter.encounter.obs, "438e1ee2-5642-4868-867d-960eca6e6451");
  if (utils.isFineValue(omrsContactHivStatus) == true && utils.isFineValue(omrsContactHivStatus.name) == true && utils.isFineValue(omrsContactHivStatus.name.name) == true) {
    omrsContactHivStatus = omrsContactHivStatus.uuid;
  } else {
    omrsContactHivStatus = "";
  }

  var omrsRiskOfViolence = utils.getContactGroupConceptValue(incomingEncounter.encounter.obs, "5d90078d-43d5-4ea1-9bf6-cda5398d1d67");
  if (utils.isFineValue(omrsRiskOfViolence) == true && utils.isFineValue(omrsRiskOfViolence.name) == true && utils.isFineValue(omrsRiskOfViolence.name.name) == true) {
    omrsRiskOfViolence = omrsRiskOfViolence.uuid;
  } else {
    omrsRiskOfViolence = "";
  }

  var omrsPlannedReferenceType = utils.getContactGroupConceptValue(incomingEncounter.encounter.obs, "d300cfbb-c771-44db-8272-7065efc88242");
  if (utils.isFineValue(omrsPlannedReferenceType) == true && utils.isFineValue(omrsPlannedReferenceType.name) == true && utils.isFineValue(omrsPlannedReferenceType.name.name) == true) {
    omrsPlannedReferenceType = omrsPlannedReferenceType.uuid;
  } else {
    omrsPlannedReferenceType = "";
  }

  var omrsContactInvited = utils.getContactGroupConceptValue(incomingEncounter.encounter.obs, "0b888b3c-df20-467c-9be9-0e68b779a97d");
  if (utils.isFineValue(omrsContactInvited) == true && utils.isFineValue(omrsContactInvited.name) == true && utils.isFineValue(omrsContactInvited.name.name) == true) {
    omrsContactInvited = omrsContactInvited.uuid;
  } else {
    omrsContactInvited = "";
  }

  var omrsContactReceived = utils.getContactGroupConceptValue(incomingEncounter.encounter.obs, "cceda879-286d-4dca-8ea8-1168f217fd1c");
  if (utils.isFineValue(omrsContactReceived) == true && utils.isFineValue(omrsContactReceived.name) == true && utils.isFineValue(omrsContactReceived.name.name) == true) {
    omrsContactReceived = omrsContactReceived.uuid;
  } else {
    omrsContactReceived = "";
  }

  var omrsReasonContactNotReceived = utils.getContactGroupConceptValue(incomingEncounter.encounter.obs, "0d52c378-adeb-4c89-a977-1f6cc4a7e9e4");
  if (utils.isFineValue(omrsReasonContactNotReceived) == true && utils.isFineValue(omrsReasonContactNotReceived.name) == true && utils.isFineValue(omrsReasonContactNotReceived.name.name) == true) {
    omrsReasonContactNotReceived = omrsReasonContactNotReceived.uuid;
  } else {
    omrsReasonContactNotReceived = "";
  }

  var omrsContactNotifier = utils.getContactGroupConceptValue(incomingEncounter.encounter.obs, "e7664ff5-a8ab-47a2-bc29-4470636a5634");
  if (utils.isFineValue(omrsContactNotifier) == true && utils.isFineValue(omrsContactNotifier.name) == true && utils.isFineValue(omrsContactNotifier.name.name) == true) {
    omrsContactNotifier = omrsContactNotifier.uuid;
  } else {
    omrsContactNotifier = "";
  }

  var omrsNotificationApproach = utils.getContactGroupConceptValue(incomingEncounter.encounter.obs, "80530ec0-b820-4fe8-9d12-9d1f6476b0bf");
  if (utils.isFineValue(omrsNotificationApproach) == true && utils.isFineValue(omrsNotificationApproach.name) == true && utils.isFineValue(omrsNotificationApproach.name.name) == true) {
    omrsNotificationApproach = omrsNotificationApproach.uuid;
  } else {
    omrsNotificationApproach = "";
  }

  var omrsContactTested = utils.getContactGroupConceptValue(incomingEncounter.encounter.obs, "5ba1d72e-8a77-4ad3-824e-19006bbf05e7");
  if (utils.isFineValue(omrsContactTested) == true && utils.isFineValue(omrsContactTested.name) == true && utils.isFineValue(omrsContactTested.name.name) == true) {
    omrsContactTested = omrsContactTested.uuid;
  } else {
    omrsContactTested = "";
  }

  var omrsReasonContactNotTested = utils.getContactGroupConceptValue(incomingEncounter.encounter.obs, "bd3649bd-8c55-4671-a9d1-d1515ca2877f");
  if (utils.isFineValue(omrsReasonContactNotTested) == true && utils.isFineValue(omrsReasonContactNotTested.name) == true && utils.isFineValue(omrsReasonContactNotTested.name.name) == true) {
    omrsReasonContactNotTested = omrsReasonContactNotTested.uuid;
  } else {
    omrsReasonContactNotTested = "";
  }

  var omrsContactHivResult = utils.getContactGroupConceptValue(incomingEncounter.encounter.obs, "c86a2bcc-638b-4696-a2ac-1a74a1781745");
  if (utils.isFineValue(omrsContactHivResult) == true && utils.isFineValue(omrsContactHivResult.name) == true && utils.isFineValue(omrsContactHivResult.name.name) == true) {
    omrsContactHivResult = omrsContactHivResult.uuid;
  } else {
    omrsContactHivResult = "";
  }

  var omrsUntestedContactGivenTestKit = utils.getContactGroupConceptValue(incomingEncounter.encounter.obs, "7bfac55f-4ae4-4f4a-a597-5584e8be6020");
  if (utils.isFineValue(omrsUntestedContactGivenTestKit) == true && utils.isFineValue(omrsUntestedContactGivenTestKit.name) == true && utils.isFineValue(omrsUntestedContactGivenTestKit.name.name) == true) {
    omrsUntestedContactGivenTestKit = omrsUntestedContactGivenTestKit.uuid;
  } else {
    omrsUntestedContactGivenTestKit = "";
  }

  var omrsContactGender = utils.getContactGroupConceptValue(incomingEncounter.encounter.obs, "d1ecd154-13b1-433a-8480-3213e178aff7");
  if (utils.isFineValue(omrsContactGender) == true && utils.isFineValue(omrsContactGender.name) == true && utils.isFineValue(omrsContactGender.name.name) == true) {
    omrsContactGender = omrsContactGender.uuid;
  } else {
    omrsContactGender = "";
  }

  //End of UUID retrieving

  utils.getDhis2DropdownValue(utils.getDHIS2RelationOfContact(omrsRelationOfContact), function (result) {
    patientRelationOfContactValue = result;
    utils.getDhis2DropdownValue(utils.getDHIS2ContactHivStatus(omrsContactHivStatus), function (result) {
      patientContactHivStatusValue = result;
      utils.getDhis2DropdownValue(utils.getDHIS2OuiNonResponse(omrsRiskOfViolence), function (result) {
        patientRiskOfViolenceValue = result;
        utils.getDhis2DropdownValue(utils.getDHIS2PlannedReferenceType(omrsPlannedReferenceType), function (result) {
          patientPlannedReferenceTypeValue = result;
          utils.getDhis2DropdownValue(utils.getDHIS2OuiNonResponse(omrsContactInvited), function (result) {
            patientContactInvitedValue = result;
            utils.getDhis2DropdownValue(utils.getDHIS2OuiNonResponse(omrsContactReceived), function (result) {
              patientContactReceivedValue = result;
              utils.getDhis2DropdownValue(utils.getDHIS2ReasonContactNotReceived(omrsReasonContactNotReceived), function (result) {
                patientReasonContactNotReceivedValue = result;
                utils.getDhis2DropdownValue(utils.getDHIS2ContactNotifier(omrsContactNotifier), function (result) {
                  patientContactNotifierValue = result;
                  utils.getDhis2DropdownValue(utils.getDHIS2NotificationApproach(omrsNotificationApproach), function (result) {
                    patientNotificationApproachValue = result;
                    utils.getDhis2DropdownValue(utils.getDHIS2OuiNonResponse(omrsContactTested), function (result) {
                      patientContactTestedValue = result;
                      utils.getDhis2DropdownValue(utils.getDHIS2ReasonContactNotTested(omrsReasonContactNotTested), function (result) {
                        patientReasonContactNotTestedValue = result;
                        utils.getDhis2DropdownValue(utils.getDHIS2ContactHivResult(omrsContactHivResult), function (result) {
                          patientContactHivResultValue = result;
                          utils.getDhis2DropdownValue(utils.getDHIS2OuiNonResponse(omrsUntestedContactGivenTestKit), function (result) {
                            patientUntestedContactGivenTestKitValue = result;
                            utils.getDhis2DropdownValue(utils.getDHIS2ContactGender(omrsContactGender), function (result) {
                              patientContactGenderValue = result;
                              utils.getDhis2DropdownValue(utils.getDHIS2OuiNonResponse(omrsContactOnART), function(result){
                                patientContactOnART = result;
//End of retrieving of the the matching value of the concept from DHIS2 for each dropdown

                              //1- sending createNewEventStageInfoContacts
                              //DHIS2 Json payload updating before pushing
                                var dhsi2ContactStructure =
                                {
                                  "program": "CYyICYiO5zo",
                                  "orgUnit": organizationUnit,
                                  "eventDate": eventDate,
                                  "status": "COMPLETED",
                                  "storedBy": "amza",
                                  "programStage": "RtQV53iuq7z",
                                  "trackedEntityInstance": trackedEntityInstanceId,
                                  "enrollment": enrollmentId,
                                  "dataValues": [
                                    {
                                      "dataElement": "CIh22FjXvOR",
                                      "value": patientCodeOfContactValue
                                    },
                                    {
                                      "dataElement": "m3pQUNk6AeL",
                                      "value": patientContactGenderValue
                                    },
                                    {
                                      "dataElement": "Zxkghqkbn7p",
                                      "value": patientRelationOfContactValue
                                    },
                                    {
                                      "dataElement": "scledbnTVVK",
                                      "value": patientContactHivStatusValue
                                    },
                                    {
                                      "dataElement": "mfAyPSJA74t",
                                      "value": patientRiskOfViolenceValue
                                    },
                                    {
                                      "dataElement": "iz0c8aW79QH",
                                      "value": patientPlannedReferenceTypeValue
                                    },
                                    {
                                      "dataElement": "MgkDDuHQHeN",
                                      "value": patientAgeOfContactValue
                                    }
                                  ]
                                }


                                //2- sending createNewEventStageResultContactNotif
                                //DHIS2 Json payload updating before pushing
                                var dhsi2NotifStructure =
                                {
                                  "program": "CYyICYiO5zo",
                                  "orgUnit": organizationUnit,
                                  "eventDate": eventDate,
                                  "status": "COMPLETED",
                                  "storedBy": "Savics",
                                  "programStage": "b9rxVAiJaxA",
                                  "trackedEntityInstance": trackedEntityInstanceId,
                                  "enrollment": enrollmentId,
                                  "dataValues": [
                                    {
                                      "dataElement": "VsEnL2R7crc",
                                      "value": patientContactInvitedValue
                                    },
                                    {
                                      "dataElement": "VuZnWho10cr",
                                      "value": patientContactReceivedValue
                                    },
                                    {
                                      "dataElement": "SUL0FdHdNyq",
                                      "value": patientContactTestedValue
                                    },
                                    {
                                      "dataElement": "y0Z5EVxKowc",
                                      "value": patientContactOnART
                                    },
                                    {
                                      "dataElement": "iTx0txf0FVj",
                                      "value": patientUntestedContactGivenTestKitValue
                                    },
                                    {
                                      "dataElement": "jJxPUCWKW1K",
                                      "value": patientContactObservationsValue
                                    },
                                    {
                                      "dataElement": "i5f4SA6TGRt",
                                      "value": patientReasonContactNotReceivedValue
                                    },
                                    {
                                      "dataElement": "Y7RU4f1g49C",
                                      "value": ""
                                    },
                                    {
                                      "dataElement": "GE0hAdM6xMg",
                                      "value": patientContactNotifierValue
                                    },
                                    {
                                      "dataElement": "r3DvI1uxJM0",
                                      "value": ""
                                    },
                                    {
                                      "dataElement": "UXx7mkioReb",
                                      "value": patientNotificationApproachValue
                                    },
                                    {
                                      "dataElement": "kVoTnMfXnyt",
                                      "value": ""
                                    },
                                    {
                                      "dataElement": "sCvxPIDQ66r",
                                      "value": patientContactUPIDValue
                                    },
                                    {
                                      "dataElement": "r1PVDg5nIGZ",
                                      "value": patientContactHivPositifTrackedNumberValue
                                    },
                                    {
                                      "dataElement": "OsZRlnXq7Qk",
                                      "value": patientReasonContactNotTestedValue
                                    },
                                    {
                                      "dataElement": "yRpn8oL0vxv",
                                      "value": patientContactHivResultValue
                                    }
                                  ]
                                }


                                winston.info('Now, adding contacts information...');
                                formMapping.pushFormToDhis2(formMapping.form1MappingTable, incomingEncounter, dhsi2ContactStructure, 2, formMapping.form1MappingBooleanTable, function (error, result) {
                                  if (error) {
                                    winston.error('An error occured when trying to add a contacts information ', error);
                                    callback('An error occured when trying to add a contacts information ');
                                  } else {
                                      winston.info('Contacts information added with success ', result);

                                      winston.info('Now, adding results of contacts notifications...');
                                      formMapping.pushFormToDhis2(formMapping.form1MappingTable, incomingEncounter, dhsi2NotifStructure, 3, formMapping.form1MappingBooleanTable, function (error, result) {
                                        if (error) {
                                          winston.error('An error occured when trying to add a results of contacts notifications', error);
                                          callback('An error occured when trying to add a results of contacts notifications');
                                        } else {
                                          winston.info('Results of contacts notifications added with success', result);
                                          callback(null, 'Results of contacts notifications added with success');
                                        }
                                      })
                                    }
                                  }
                                );



                              });
                            });
                          });
                        });
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });  
    });
  });
};
//End of the CBS contact information Form


// Beginning of the ENROLLEMENT INFORMATION
var addHivCrfSection1 = function (incomingEncounter, organizationUnit, trackedEntityInstanceId, enrollmentId, callback) {
  //createNewEventStageEnrollmentInfo.json  
  //Declaration of all the variables for DHIS2 dropdown and patient data
  var patientBirhDate = "";
  var patientGender = "";
  var patientMaritalStatus = "";
  var patientOccupation = ""; // Employment status
  var patientAddressObject = "";
  var patientSecteur = "";
  var patientDistrict = "";
  var patientVillage = "";
  var patientCellule = "";
  var patientVisitDate = "";


  var patientIndexCaseTypeValue = "";
  var patientARTStartLocationValue = "";
  var patientResidencyTypeValue = "";
  var patientOccupationTypeValue = "";
  var patientVASWCLast12mValue = "";
  var patientSexWithMaleValue = "";
  var patientSexWithFemaleValue = "";
  var patientSexWithHivPositifPersonValue = "";
  var patientSexWithComSexWorkerValue = "";
  var patientSexWithMultiplePartnerValue = "";
  var patientBeComSexWorkerValue = "";
  var patientHivTestingClinicValue = "";
  var patientRecencyAssayTestDoneValue = "";
  var patientForm2RecencyAssayResultValue = "";
  var patientFinalRitaRecencyResultValue = "";
  var patientFinalRitaInconclusiveValue = "";
  var patientConselledOnLinkageValue = "";
  var patientLinkedToTreatmentValue = "";
  var patientLinkedToTreatmentAtThisFacilityValue = "";
  var patientInitiatedOnTPTValue = "";
  var patientReasonNotInitOnTPTValue = "";
  var patientStableValue = "";
  var patientIsPregnantValue = "";


  //Reporting date in DHIS2 must be the encounterDate
  var eventDate = utils.convertToDate(incomingEncounter.encounter.encounterDatetime);

  //Retrieve the UUID for each dropdown concept from OpenMRS
  //Begining of UUID retrieving 
  var omrsARTStartLocation = utils.getConceptValue(incomingEncounter.encounter.obs, "d3892b43-18be-4870-8d9b-02f5318f9cd5");
  if (utils.isFineValue(omrsARTStartLocation) == true && utils.isFineValue(omrsARTStartLocation.name) == true && utils.isFineValue(omrsARTStartLocation.name.name) == true) {
    omrsARTStartLocation = omrsARTStartLocation.uuid;
  } else {
    omrsARTStartLocation = "";
  }

  var omrsIndexCaseType = utils.getConceptValue(incomingEncounter.encounter.obs, "b45597da-318b-4dde-858b-da16f5950686");
  if (utils.isFineValue(omrsIndexCaseType) == true && utils.isFineValue(omrsIndexCaseType.name) == true && utils.isFineValue(omrsIndexCaseType.name.name) == true) {
    omrsIndexCaseType = omrsIndexCaseType.uuid;
  } else {
    omrsIndexCaseType = "";
  }

  var omrsResidencyType = utils.getConceptValue(incomingEncounter.encounter.obs, "59525e15-fc5e-4bc4-9e29-87954348c15f");
  if (utils.isFineValue(omrsResidencyType) == true && utils.isFineValue(omrsResidencyType.name) == true && utils.isFineValue(omrsResidencyType.name.name) == true) {
    omrsResidencyType = omrsResidencyType.uuid;
  } else {
    omrsResidencyType = "";
  }
  
  var omrsOccupationType = utils.getConceptValue(incomingEncounter.encounter.obs,"3cd97286-26fe-102b-80cb-0017a47871b2");
  if (utils.isFineValue(omrsOccupationType) == true && utils.isFineValue(omrsOccupationType.uuid) == true && utils.isFineValue(omrsOccupationType.display) == true) {
    omrsOccupationType = omrsOccupationType.uuid;
  } else {
    omrsOccupationType = "";
  }


  var omrsIsPregnant = utils.getConceptValue(incomingEncounter.encounter.obs, "be075303-3a46-4b89-8b8c-912acb2a75e7");
  if (utils.isFineValue(omrsIsPregnant) == true && utils.isFineValue(omrsIsPregnant.name) == true && utils.isFineValue(omrsIsPregnant.name.name) == true) {
    omrsIsPregnant = omrsIsPregnant.uuid;
  } else {
    omrsIsPregnant = "";
  }



  var omrsVASWCLast12m = utils.getConceptValue(incomingEncounter.encounter.obs, "788e9f4c-5ba4-4a42-9974-83ea7128f0f8");
  if (utils.isFineValue(omrsVASWCLast12m) == true && utils.isFineValue(omrsVASWCLast12m.name) == true && utils.isFineValue(omrsVASWCLast12m.name.name) == true) {
    omrsVASWCLast12m = omrsVASWCLast12m.uuid;
  } else {
    omrsVASWCLast12m = "";
  }

  var omrsSexWithMale = utils.getConceptValue(incomingEncounter.encounter.obs, "a116b5b4-8973-43ac-8007-c070b4199a53");
  if (utils.isFineValue(omrsSexWithMale) == true && utils.isFineValue(omrsSexWithMale.name) == true && utils.isFineValue(omrsSexWithMale.name.name) == true) {
    omrsSexWithMale = omrsSexWithMale.uuid;
  } else {
    omrsSexWithMale = "";
  }

  var omrsSexWithFemale = utils.getConceptValue(incomingEncounter.encounter.obs, "8191ff34-f72e-4f67-af0a-82acebca682a");
  if (utils.isFineValue(omrsSexWithFemale) == true && utils.isFineValue(omrsSexWithFemale.name) == true && utils.isFineValue(omrsSexWithFemale.name.name) == true) {
    omrsSexWithFemale = omrsSexWithFemale.uuid;
  } else {
    omrsSexWithFemale = "";
  }

  var omrsSexWithHivPositifPerson = utils.getConceptValue(incomingEncounter.encounter.obs, "b195b807-2213-4831-aeb8-0ac03cd139e4");
  if (utils.isFineValue(omrsSexWithHivPositifPerson) == true && utils.isFineValue(omrsSexWithHivPositifPerson.name) == true && utils.isFineValue(omrsSexWithHivPositifPerson.name.name) == true) {
    omrsSexWithHivPositifPerson = omrsSexWithHivPositifPerson.uuid;
  } else {
    omrsSexWithHivPositifPerson = "";
  }

  var omrsSexWithComSexWorker = utils.getConceptValue(incomingEncounter.encounter.obs, "d37d8242-2626-4404-94fd-5e78877457ab");
  if (utils.isFineValue(omrsSexWithComSexWorker) == true && utils.isFineValue(omrsSexWithComSexWorker.name) == true && utils.isFineValue(omrsSexWithComSexWorker.name.name) == true) {
    omrsSexWithComSexWorker = omrsSexWithComSexWorker.uuid;
  } else {
    omrsSexWithComSexWorker = "";
  }

  var omrsSexWithMultiplePartner = utils.getConceptValue(incomingEncounter.encounter.obs, "a239017b-7bc1-421e-b348-d526e7ebd9d7");
  if (utils.isFineValue(omrsSexWithMultiplePartner) == true && utils.isFineValue(omrsSexWithMultiplePartner.name) == true && utils.isFineValue(omrsSexWithMultiplePartner.name.name) == true) {
    omrsSexWithMultiplePartner = omrsSexWithMultiplePartner.uuid;
  } else {
    omrsSexWithMultiplePartner = "";
  }

  var omrsBeComSexWorker = utils.getConceptValue(incomingEncounter.encounter.obs, "8726f435-566e-4c98-920d-b93ce22224b7");
  if (utils.isFineValue(omrsBeComSexWorker) == true && utils.isFineValue(omrsBeComSexWorker.name) == true && utils.isFineValue(omrsBeComSexWorker.name.name) == true) {
    omrsBeComSexWorker = omrsBeComSexWorker.uuid;
  } else {
    omrsBeComSexWorker = "";
  }

  var omrsHivTestingClinic = utils.getConceptValue(incomingEncounter.encounter.obs, "151a4503-8b27-4d17-9ebf-a94cdf02e028");
  if (utils.isFineValue(omrsHivTestingClinic) == true && utils.isFineValue(omrsHivTestingClinic.name) == true && utils.isFineValue(omrsHivTestingClinic.name.name) == true) {
    omrsHivTestingClinic = omrsHivTestingClinic.uuid;
  } else {
    omrsHivTestingClinic = "";
  }

  var omrsRecencyAssayTestDone = utils.getConceptValue(incomingEncounter.encounter.obs, "e06cffdb-024c-45af-b148-fa275d368fc0");
  if (utils.isFineValue(omrsRecencyAssayTestDone) == true && utils.isFineValue(omrsRecencyAssayTestDone.name) == true && utils.isFineValue(omrsRecencyAssayTestDone.name.name) == true) {
    omrsRecencyAssayTestDone = omrsRecencyAssayTestDone.uuid;
  } else {
    omrsRecencyAssayTestDone = "";
  }

  var omrsForm2RecencyAssayResult = utils.getConceptValue(incomingEncounter.encounter.obs, "b4b0e241-e41a-4d46-89dd-e531cf6d8202");
  if (utils.isFineValue(omrsForm2RecencyAssayResult) == true && utils.isFineValue(omrsForm2RecencyAssayResult.name) == true && utils.isFineValue(omrsForm2RecencyAssayResult.name.name) == true) {
    omrsForm2RecencyAssayResult = omrsForm2RecencyAssayResult.uuid;
  } else {
    omrsForm2RecencyAssayResult = "";
  }

  var omrsFinalRitaRecencyResult = utils.getConceptValue(incomingEncounter.encounter.obs, "a2053e28-9ce9-4647-8a96-6f1b7c62f429");
  if (utils.isFineValue(omrsFinalRitaRecencyResult) == true && utils.isFineValue(omrsFinalRitaRecencyResult.name) == true && utils.isFineValue(omrsFinalRitaRecencyResult.name.name) == true) {
    omrsFinalRitaRecencyResult = omrsFinalRitaRecencyResult.uuid;
  } else {
    omrsFinalRitaRecencyResult = "";
  }

  var omrsFinalRitaInconclusive = utils.getConceptValue(incomingEncounter.encounter.obs, "ba4b8a83-54ab-44f3-a7c5-4495ddf055bc");
  if (utils.isFineValue(omrsFinalRitaInconclusive) == true && utils.isFineValue(omrsFinalRitaInconclusive.name) == true && utils.isFineValue(omrsFinalRitaInconclusive.name.name) == true) {
    omrsFinalRitaInconclusive = omrsFinalRitaInconclusive.uuid;
  } else {
    omrsFinalRitaInconclusive = "";
  }

  var omrsConselledOnLinkage = utils.getConceptValue(incomingEncounter.encounter.obs, "a80a32ae-7683-49cd-abda-1cd946f0f445");
  if (utils.isFineValue(omrsConselledOnLinkage) == true && utils.isFineValue(omrsConselledOnLinkage.name) == true && utils.isFineValue(omrsConselledOnLinkage.name.name) == true) {
    omrsConselledOnLinkage = omrsConselledOnLinkage.uuid;
  } else {
    omrsConselledOnLinkage = "";
  }

  var omrsLinkedToTreatment = utils.getConceptValue(incomingEncounter.encounter.obs, "0cf3bed0-e76a-4b0a-8e11-c61c945a0551");
  if (utils.isFineValue(omrsLinkedToTreatment) == true && utils.isFineValue(omrsLinkedToTreatment.name) == true && utils.isFineValue(omrsLinkedToTreatment.name.name) == true) {
    omrsLinkedToTreatment = omrsLinkedToTreatment.uuid;
  } else {
    omrsLinkedToTreatment = "";
  }

  var omrsLinkedToTreatmentAtThisFacility = utils.getConceptValue(incomingEncounter.encounter.obs, "a1ce679f-1f65-468c-97c3-c81d7ff38399");
  if (utils.isFineValue(omrsLinkedToTreatmentAtThisFacility) == true && utils.isFineValue(omrsLinkedToTreatmentAtThisFacility.name) == true && utils.isFineValue(omrsLinkedToTreatmentAtThisFacility.name.name) == true) {
    omrsLinkedToTreatmentAtThisFacility = omrsLinkedToTreatmentAtThisFacility.uuid;
  } else {
    omrsLinkedToTreatmentAtThisFacility = "";
  }

  var omrsInitiatedOnTPT = utils.getConceptValue(incomingEncounter.encounter.obs, "c341a733-630f-420f-ace6-80f6d463bc39");
  if (utils.isFineValue(omrsInitiatedOnTPT) == true && utils.isFineValue(omrsInitiatedOnTPT.name) == true && utils.isFineValue(omrsInitiatedOnTPT.name.name) == true) {
    omrsInitiatedOnTPT = omrsInitiatedOnTPT.uuid;
  } else {
    omrsInitiatedOnTPT = "";
  }

  var omrsReasonNotInitOnTPT = utils.getConceptValue(incomingEncounter.encounter.obs, "97533455-8642-4b0a-947a-f730bf39da09");
  if (utils.isFineValue(omrsReasonNotInitOnTPT) == true && utils.isFineValue(omrsReasonNotInitOnTPT.name) == true && utils.isFineValue(omrsReasonNotInitOnTPT.name.name) == true) {
    omrsReasonNotInitOnTPT = omrsReasonNotInitOnTPT.uuid;
  } else {
    omrsReasonNotInitOnTPT = "";
  }

  var omrsStable = utils.getConceptValue(incomingEncounter.encounter.obs, "	fab9afe9-8c11-4e31-9898-399b083fd9d6");
  if (utils.isFineValue(omrsStable) == true && utils.isFineValue(omrsStable.name) == true && utils.isFineValue(omrsStable.name.name) == true) {
    omrsStable = omrsStable.uuid;
  } else {
    omrsStable = "";
  }
  //End of UUID retrieving


  if (utils.isFineValue(incomingEncounter.patient.person.birthdate) == true) {
    patientBirhDate = utils.convertToDate(incomingEncounter.patient.person.birthdate);
  }

  if(utils.isFineValue(incomingEncounter.encounter.encounterDatetime) == true) {
    patientVisitDate = utils.convertToDate(incomingEncounter.encounter.encounterDatetime);
  }

  patientAddressObject = utils.getdhis2ProvinceDistrictIds(incomingEncounter.patient);

  //getting patient Cellule and Village
  patientCellule = patientAddressObject.cellule;
  patientVillage = patientAddressObject.village;
  
  //getting patient secteur and district from DHIS2
    var patientSectorDetails = incomingEncounter.patient.person.preferredAddress.cityVillage;
    var patientDistrictDetails = incomingEncounter.patient.person.preferredAddress.countyDistrict;
    
    utils.getDHIS2DistritctOrSectorId(patientSectorDetails,5,function(result){
      patientSecteur = result;
      utils.getDHIS2DistritctOrSectorId(patientDistrictDetails,3,function(result){
        patientDistrict = result;

        //getting gender from DHIS2
        utils.getDhis2DropdownValue(utils.getPatientGenderDhis2Id(incomingEncounter.patient), function (result) {
          patientGender = result;
          var omrsOccupationValue = utils.getConceptValue(incomingEncounter.encounter.obs, "4587542b-f1aa-47ad-8bed-75a705433950");
          if (utils.isFineValue(omrsOccupationValue) == true && utils.isFineValue(omrsOccupationValue.name) == true && utils.isFineValue(omrsOccupationValue.name.name) == true) {
            omrsOccupationValue = omrsOccupationValue.uuid;
          } else {
            omrsOccupationValue = "";
          }

          //Beginning of the retrieving of all the dropdown value from DHIS2
          patientIsPregnantValue = utils.getDHIS2YesNoUnknown(omrsIsPregnant);
          patientConselledOnLinkageValue = utils.getDHIS2Boolean(omrsConselledOnLinkage);
          patientLinkedToTreatmentValue = utils.getDHIS2Boolean(omrsLinkedToTreatment);
          patientLinkedToTreatmentAtThisFacilityValue = utils.getDHIS2Boolean(omrsLinkedToTreatmentAtThisFacility);
          patientInitiatedOnTPTValue = utils.getDHIS2Boolean(omrsInitiatedOnTPT);
          patientStableValue = utils.getDHIS2Boolean(omrsStable);

          utils.getDhis2DropdownValue(utils.getDHIS2Occupation(omrsOccupationValue), function (result) {
            patientOccupation = result;
            utils.getDhis2DropdownValue(utils.getPatientMaritalStatusDhis2Id(incomingEncounter.patient), function (result) {
              patientMaritalStatus = result;
              utils.getDhis2DropdownValue(utils.getDHIS2ARTStartLocation(omrsARTStartLocation), function (result) {
                patientARTStartLocationValue = result;
                utils.getDhis2DropdownValue(utils.getDHIS2IndexCaseType(omrsIndexCaseType), function (result) {
                  patientIndexCaseTypeValue = result;
                  utils.getDhis2DropdownValue(utils.getDHIS2ResidencyType(omrsResidencyType), function (result) {
                    patientResidencyTypeValue = result;
                    utils.getDhis2DropdownValue(utils.getDHIS2OccupationType(omrsOccupationType), function (result) {
                      patientOccupationTypeValue = result;
                      utils.getDhis2DropdownValue(utils.getDHIS2YesNoRefuseUnknown(omrsVASWCLast12m), function (result) {
                        patientVASWCLast12mValue = result;
                        utils.getDhis2DropdownValue(utils.getDHIS2YesNoRefuseUnknown(omrsSexWithMale), function (result) {
                          patientSexWithMaleValue = result;
                          utils.getDhis2DropdownValue(utils.getDHIS2YesNoRefuseUnknown(omrsSexWithFemale), function (result) {
                            patientSexWithFemaleValue = result;
                            utils.getDhis2DropdownValue(utils.getDHIS2YesNoRefuseUnknown(omrsSexWithHivPositifPerson), function (result) {
                              patientSexWithHivPositifPersonValue = result;
                              utils.getDhis2DropdownValue(utils.getDHIS2YesNoRefuseUnknown(omrsSexWithComSexWorker), function (result) {
                                patientSexWithComSexWorkerValue = result;
                                utils.getDhis2DropdownValue(utils.getDHIS2YesNoRefuseUnknown(omrsSexWithMultiplePartner), function (result) {
                                  patientSexWithMultiplePartnerValue = result;
                                  utils.getDhis2DropdownValue(utils.getDHIS2YesNoRefuseUnknown(omrsBeComSexWorker), function (result) {
                                    patientBeComSexWorkerValue = result;
                                    utils.getDhis2DropdownValue(utils.getDHIS2HivTestingClinic(omrsHivTestingClinic), function (result) {
                                      patientHivTestingClinicValue = result;
                                      utils.getDhis2DropdownValue(utils.getDHIS2YesNoResponse(omrsRecencyAssayTestDone), function (result) {
                                        patientRecencyAssayTestDoneValue = result;
                                        utils.getDhis2DropdownValue(utils.getDHIS2Form2RecencyAssayResult(omrsForm2RecencyAssayResult), function (result) {
                                          patientForm2RecencyAssayResultValue = result;
                                          utils.getDhis2DropdownValue(utils.getDHIS2FinalRitaRecencyResult(omrsFinalRitaRecencyResult), function (result) {
                                            patientFinalRitaRecencyResultValue = result;
                                            utils.getDhis2DropdownValue(utils.getDHIS2YesNoResponse(omrsFinalRitaInconclusive), function (result) {
                                              patientFinalRitaInconclusiveValue = result;
                                              utils.getDhis2DropdownValue(utils.getDHIS2ReasonNotInitiatedOnTPT(omrsReasonNotInitOnTPT), function (result) {
                                                patientReasonNotInitOnTPTValue = result;
        //End of the retrieving of all the dropdown value from DHIS2

                                                //DHIS2 Json payload updating before pushing
                                                var dhis2EnrollementStructure =
                                                {
                                                  "program": "CYyICYiO5zo",
                                                  "orgUnit": organizationUnit,
                                                  "eventDate": eventDate,
                                                  "status": "COMPLETED",
                                                  "storedBy": "Savics",
                                                  "programStage": "pBAeqPjnhdF",
                                                  "trackedEntityInstance": trackedEntityInstanceId,
                                                  "enrollment": enrollmentId,
                                                  "dataValues": [
                                                    {
                                                      "dataElement": "pbeBAIly2GT",
                                                      "value": organizationUnit
                                                    },
                                                    {
                                                      "dataElement": "qycXEyMMFMb",
                                                      "value": patientIndexCaseTypeValue
                                                    },
                                                    {
                                                      "dataElement": "txsxKp2l6y9",
                                                      "value": eventDate
                                                    },
                                                    {
                                                      "dataElement": "oLqMrGMI4Uf",
                                                      "value": patientVisitDate
                                                    },
                                                    {
                                                      "dataElement": "MBGs0EV2id5",
                                                      "value": ""
                                                    },
                                                    {
                                                      "dataElement": "GIC3Oq7ruS0",
                                                      "value": ""
                                                    },
                                                    {
                                                      "dataElement": "I809QdRlgCb",
                                                      "value": ""
                                                    },
                                                    {
                                                      "dataElement": "tnMNaBmQaIy",
                                                      "value": ""
                                                    },
                                                    {
                                                      "dataElement": "wXcnNSYryUd",
                                                      "value": ""
                                                    },
                                                    {
                                                      "dataElement": "pGmLtnqqn6c",
                                                      "value": ""
                                                    },
                                                    {
                                                      "dataElement": "aYhoeOchJYM",
                                                      "value": patientARTStartLocationValue
                                                    },
                                                    {
                                                      "dataElement": "GwCiJLY0of4",
                                                      "value": patientBirhDate
                                                    },
                                                    {
                                                      "dataElement": "c4KsTiEImGx",
                                                      "value": patientGender
                                                    },
                                                    {
                                                      "dataElement": "qsCPZIJLpYo",
                                                      "value": patientIsPregnantValue
                                                    },
                                                    {
                                                      "dataElement": "ZvH6DY75uR1",
                                                      "value": patientResidencyTypeValue
                                                    },
                                                    {
                                                      "dataElement": "p5U0vUS0Q3V",
                                                      "value": patientVillage
                                                    },
                                                    {
                                                      "dataElement": "I79uRgVEyUc",
                                                      "value": patientCellule
                                                    },
                                                    {
                                                      "dataElement": "UaCDJMTQRLz",
                                                      "value": patientSecteur
                                                    },
                                                    {
                                                      "dataElement": "kPkjR4qEhhn",
                                                      "value": patientDistrict
                                                    },
                                                    {
                                                      "dataElement": "PZo2sP0TOb6",
                                                      "value": patientMaritalStatus
                                                    },
                                                    {
                                                      "dataElement": "NrWXvZg3WtW",
                                                      "value": patientOccupation
                                                    },
                                                    {
                                                      "dataElement": "Cgt39EInKQV",
                                                      "value": patientOccupationTypeValue
                                                    },
                                                    {
                                                      "dataElement": "SzvTcCTNlGo",
                                                      "value": patientVASWCLast12mValue
                                                    },
                                                    {
                                                      "dataElement": "G0Jq8kyaJCD",
                                                      "value": ""
                                                    },
                                                    {
                                                      "dataElement": "xHo7COhyMKM",
                                                      "value": ""
                                                    },
                                                    {
                                                      "dataElement": "MyMV3TTWYmW",
                                                      "value": ""
                                                    },
                                                    {
                                                      "dataElement": "SNAaIVKCh78",
                                                      "value": ""
                                                    },
                                                    {
                                                      "dataElement": "eUVdYRa8qUo",
                                                      "value": ""
                                                    },
                                                    {
                                                      "dataElement": "KY4a5xCSKgT",
                                                      "value": patientHivTestingClinicValue
                                                    },
                                                    {
                                                      "dataElement": "VQPCeakHIpV",
                                                      "value": patientRecencyAssayTestDoneValue
                                                    },
                                                    {
                                                      "dataElement": "NFOu3OCGMKl",
                                                      "value": ""
                                                    },
                                                    {
                                                      "dataElement": "NZe43UAOGmt",
                                                      "value": patientForm2RecencyAssayResultValue
                                                    },
                                                    {
                                                      "dataElement": "i7AuzJQFo8O",
                                                      "value": ""
                                                    },
                                                    {
                                                      "dataElement": "ccYYcYf78sz",
                                                      "value": ""
                                                    },
                                                    {
                                                      "dataElement": "Ba8VCAO9Nqi",
                                                      "value": ""
                                                    },
                                                    {
                                                      "dataElement": "yu2bxd3xVIg",
                                                      "value": ""
                                                    },
                                                    {
                                                      "dataElement": "ptZMCKSxvU8",
                                                      "value": ""
                                                    },
                                                    {
                                                      "dataElement": "qBYsHDuUBIv",
                                                      "value": patientFinalRitaRecencyResultValue
                                                    },
                                                    {
                                                      "dataElement": "nMJKcTFHGj0",
                                                      "value": patientFinalRitaInconclusiveValue
                                                    },
                                                    {
                                                      "dataElement": "DDHl9CtiqaC",
                                                      "value": patientConselledOnLinkageValue
                                                    },
                                                    {
                                                      "dataElement": "RDQB5Zx8hMH",
                                                      "value": patientLinkedToTreatmentValue
                                                    },
                                                    {
                                                      "dataElement": "ocgzZ6BdT8W",
                                                      "value": ""
                                                    },
                                                    {
                                                      "dataElement": "ZodoxM8PakE",
                                                      "value": patientLinkedToTreatmentAtThisFacilityValue
                                                    },
                                                    {
                                                      "dataElement": "ERqqYuUtigv",
                                                      "value": ""
                                                    },
                                                    {
                                                      "dataElement": "kJIuYQpa9Lc",
                                                      "value": patientInitiatedOnTPTValue
                                                    },
                                                    {
                                                      "dataElement": "ivqLch0DMXv",
                                                      "value": ""
                                                    },
                                                    {
                                                      "dataElement": "gNjou1Bq6dz",
                                                      "value": patientReasonNotInitOnTPTValue
                                                    },
                                                    {
                                                      "dataElement": "jYMNto3ELj5",
                                                      "value": patientStableValue
                                                    },
                                                    {
                                                      "dataElement": "mKVpD68KeIO",
                                                      "value": ""
                                                    },
                                                    {
                                                      "dataElement": "jmwJSKQthb7",
                                                      "value": ""
                                                    },
                                                    {
                                                      "dataElement": "UYuVIHot43a",
                                                      "value": ""
                                                    },
                                                    {
                                                      "dataElement": "cE0JLRDspz9",
                                                      "value": ""
                                                    },
                                                    {
                                                      "dataElement": "MWnDK640C17",
                                                      "value": ""
                                                    },
                                                    {
                                                      "dataElement": "MG6I5RT8YsE",
                                                      "value": ""
                                                    },
                                                    {
                                                      "dataElement": "Qx0v2TzHlS0",
                                                      "value": ""
                                                    },
                                                    {
                                                      "dataElement": "qywtB6np899",
                                                      "value": ""
                                                    },
                                                    {
                                                      "dataElement": "nkRWZpUQ55g",
                                                      "value": ""
                                                    },
                                                    {
                                                      "dataElement": "Tgt3yKYd2oD",
                                                      "value": ""
                                                    },
                                                    {
                                                      "dataElement": "LovSZ5zd8YL",
                                                      "value": ""
                                                    },
                                                    {
                                                      "dataElement": "ePONK5dlCAl",
                                                      "value": ""
                                                    },
                                                    {
                                                      "dataElement": "G3dUs7PuDqx",
                                                      "value": ""
                                                    },
                                                    {
                                                      "dataElement": "OKemd50jbHG",
                                                      "value": ""
                                                    },
                                                    {
                                                      "dataElement": "gJ58M7ClaMm",
                                                      "value": patientSexWithMaleValue
                                                    },
                                                    {
                                                      "dataElement": "yGhEu1ntCaf",
                                                      "value": patientSexWithMultiplePartnerValue
                                                    },
                                                    {
                                                      "dataElement": "eQFf5SRscrT",
                                                      "value": patientBeComSexWorkerValue
                                                    },
                                                    {
                                                      "dataElement": "fB1hxxwcdye",
                                                      "value": patientSexWithComSexWorkerValue
                                                    },
                                                    {
                                                      "dataElement": "ZfoeEa3kNYe",
                                                      "value": patientSexWithFemaleValue
                                                    },
                                                    {
                                                      "dataElement": "fHHFiV0HP0V",
                                                      "value": patientSexWithHivPositifPersonValue
                                                    }
                                                  ]
                                                };

                                                //Beginning of data pushing
                                                formMapping.pushFormToDhis2(formMapping.form2MappingTable, incomingEncounter, dhis2EnrollementStructure, 4, formMapping.form2MappingBooleanTable, function (error, result) {
                                                  if (error) {
                                                    winston.error('An error occured when trying to add an enrollment information', error);
                                                    callback('An error occured when trying to add an enrollment information');
                                                  } else {
                                                    winston.info('Enrollment data added with success', result);
                                                    callback(null, 'Enrollment dataadded with success');
                                                  }
                                                });
                                                //End of data pushing

                                              });
                                            });
                                          });
                                        });
                                      });
                                    });
                                  });
                                });
                              });
                            });
                          });
                        });
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
};
//End of the ENROLLEMENT INFORMATION


//Beginning of the FOLLOW UP
var addHivCrfSection2 = function (incomingEncounter, organizationUnit, trackedEntityInstanceId, enrollmentId, callback) {
  //createNewEventStageFollowUpInfo.json 

  //Declaration of all the variables for DHIS2 dropdown and patient data
  var patientDemographicChangeValue = "";
  var patientResidencyTypeValue = "";
  var patientMaritalStatus = "";
  var patientOccupation = "";
  var patientOccupationTypeValue = "";
  var patientRiskFactorChangeValue = "";
  var patientFollowUpStableValue = ""; // Patient stable change in Follow UP form
  var patientChangeInTreatmentValue = "";
  var patientReasonARTChangedOrStoppedValue = "";
  var patientDrugToxicityTypeValue = "";
  var patientCBSClientOutcomeValue = "";
  var patientOverallTreatmentAdherenceValue = "";
  var patientClientTPTOutcomeValue = "";
  var patientAttendedEnhancedCounsellingValue = "";
  var patientTPTTherapyInProgressValue = "";
  var patientCompletedEnhancedCounsellingValue = "";
  var patientAddressObject = "";
  var patientSecteur = "";
  var patientDistrict = "";
  var patientVillage = "";
  var patientCellule = "";
  var patientWHOStageValue = "";
  var patientOINameValue = "";


  //Reporting date in DHIS2 must be the encounterDate
  var eventDate = utils.convertToDate(incomingEncounter.encounter.encounterDatetime);

  //Begining of UUID retrieving 
  var omrsDemographicChange = utils.getConceptValue(incomingEncounter.encounter.obs, "e63265dd-9b1c-4dc5-abfe-85863afcf4e3");
  if (utils.isFineValue(omrsDemographicChange) == true && utils.isFineValue(omrsDemographicChange.name) == true && utils.isFineValue(omrsDemographicChange.name.name) == true) {
    omrsDemographicChange = omrsDemographicChange.uuid;
  } else {
    omrsDemographicChange = "";
  }


  var omrsRiskFactorChange = utils.getConceptValue(incomingEncounter.encounter.obs, "89881216-5a02-4e7f-8a01-a2fa38acd465");
  if (utils.isFineValue(omrsRiskFactorChange) == true && utils.isFineValue(omrsRiskFactorChange.name) == true && utils.isFineValue(omrsRiskFactorChange.name.name) == true) {
    omrsRiskFactorChange = omrsRiskFactorChange.uuid;
  } else {
    omrsRiskFactorChange = "";
  }
  

  var omrsFollowUpStable = utils.getConceptValue(incomingEncounter.encounter.obs, "fab9afe9-8c11-4e31-9898-399b083fd9d6");
  if (utils.isFineValue(omrsFollowUpStable) == true && utils.isFineValue(omrsFollowUpStable.name) == true && utils.isFineValue(omrsFollowUpStable.name.name) == true) {
    omrsFollowUpStable = omrsFollowUpStable.uuid;
  } else {
    omrsFollowUpStable = "";
  }


  var omrsChangeInTreatment = utils.getConceptValue(incomingEncounter.encounter.obs, "5f2ce4b3-dc0f-4345-98ad-4177329b2388");
  if (utils.isFineValue(omrsChangeInTreatment) == true && utils.isFineValue(omrsChangeInTreatment.name) == true && utils.isFineValue(omrsChangeInTreatment.name.name) == true) {
    omrsChangeInTreatment = omrsChangeInTreatment.uuid;
  } else {
    omrsChangeInTreatment = "";
  }
  

  var omrsReasonARTChangedOrStopped = utils.getConceptValue(incomingEncounter.encounter.obs, "3cd919c6-26fe-102b-80cb-0017a47871b2");
  if (utils.isFineValue(omrsReasonARTChangedOrStopped) == true && utils.isFineValue(omrsReasonARTChangedOrStopped.name) == true && utils.isFineValue(omrsReasonARTChangedOrStopped.name.name) == true) {
    omrsReasonARTChangedOrStopped = omrsReasonARTChangedOrStopped.uuid;
  } else {
    omrsReasonARTChangedOrStopped = "";
  }
  

  var omrsDrugToxicityType = utils.getConceptValue(incomingEncounter.encounter.obs, "48a60bc9-6b67-47e7-8717-84a32840180a");
  if (utils.isFineValue(omrsDrugToxicityType) == true && utils.isFineValue(omrsDrugToxicityType.name) == true && utils.isFineValue(omrsDrugToxicityType.name.name) == true) {
    omrsDrugToxicityType = omrsDrugToxicityType.uuid;
  } else {
    omrsDrugToxicityType = "";
  }
  

  var omrsCBSClientOutcome = utils.getConceptValue(incomingEncounter.encounter.obs, "f0e8e8a2-11a9-4c58-87f1-daee5c284183");
  if (utils.isFineValue(omrsCBSClientOutcome) == true && utils.isFineValue(omrsCBSClientOutcome.name) == true && utils.isFineValue(omrsCBSClientOutcome.name.name) == true) {
    omrsCBSClientOutcome = omrsCBSClientOutcome.uuid;
  } else {
    omrsCBSClientOutcome = "";
  }
  

  var omrsOverallTreatmentAdherence = utils.getConceptValue(incomingEncounter.encounter.obs, "00e37896-0d51-4cda-a0f2-df56cccab894");
  /*if (utils.isFineValue(omrsOverallTreatmentAdherence) == true && utils.isFineValue(omrsOverallTreatmentAdherence.name) == true && utils.isFineValue(omrsOverallTreatmentAdherence.name.name) == true) {
    omrsOverallTreatmentAdherence = omrsOverallTreatmentAdherence.uuid;
  } else {
    omrsOverallTreatmentAdherence = "";
  }*/


  var omrsClientTPTOutcome = utils.getConceptValue(incomingEncounter.encounter.obs, "6d024c01-dc13-4074-b493-ba72bdb0739e");
  if (utils.isFineValue(omrsClientTPTOutcome) == true && utils.isFineValue(omrsClientTPTOutcome.name) == true && utils.isFineValue(omrsClientTPTOutcome.name.name) == true) {
    omrsClientTPTOutcome = omrsClientTPTOutcome.uuid;
  } else {
    omrsClientTPTOutcome = "";
  }


  var omrsAttendedEnhancedCounselling = utils.getConceptValue(incomingEncounter.encounter.obs, "106e1e0a-40a8-4fcc-9e58-96f69a3693b6");
  if (utils.isFineValue(omrsAttendedEnhancedCounselling) == true && utils.isFineValue(omrsAttendedEnhancedCounselling.name) == true && utils.isFineValue(omrsAttendedEnhancedCounselling.name.name) == true) {
    omrsAttendedEnhancedCounselling = omrsAttendedEnhancedCounselling.uuid;
  } else {
    omrsAttendedEnhancedCounselling = "";
  }


  var omrsTPTTherapyInProgress = utils.getConceptValue(incomingEncounter.encounter.obs, "35b9992e-c5e4-464c-b800-969adcfee12c");
  if (utils.isFineValue(omrsTPTTherapyInProgress) == true && utils.isFineValue(omrsTPTTherapyInProgress.name) == true && utils.isFineValue(omrsTPTTherapyInProgress.name.name) == true) {
    omrsTPTTherapyInProgress = omrsTPTTherapyInProgress.uuid;
  } else {
    omrsTPTTherapyInProgress = "";
  }


  var omrsCompletedEnhancedCounselling = utils.getConceptValue(incomingEncounter.encounter.obs, "106e1e0a-40a8-4fcc-9e58-96f69a3693b6");
  if (utils.isFineValue(omrsCompletedEnhancedCounselling) == true && utils.isFineValue(omrsCompletedEnhancedCounselling.name) == true && utils.isFineValue(omrsCompletedEnhancedCounselling.name.name) == true) {
    omrsCompletedEnhancedCounselling = omrsCompletedEnhancedCounselling.uuid;
  } else {
    omrsCompletedEnhancedCounselling = "";
  }


  var omrsWHOStage = utils.getConceptValue(incomingEncounter.encounter.obs, "3cdb3b02-26fe-102b-80cb-0017a47871b2");
  if (utils.isFineValue(omrsWHOStage) == true && utils.isFineValue(omrsWHOStage.name) == true && utils.isFineValue(omrsWHOStage.name.name) == true) {
    omrsWHOStage = omrsWHOStage.uuid;
  } else {
    omrsWHOStage = "";
  }


  var omrsResidencyType = utils.getConceptValue(incomingEncounter.encounter.obs, "59525e15-fc5e-4bc4-9e29-87954348c15f");
  if (utils.isFineValue(omrsResidencyType) == true && utils.isFineValue(omrsResidencyType.name) == true && utils.isFineValue(omrsResidencyType.name.name) == true) {
    omrsResidencyType = omrsResidencyType.uuid;
  } else {
    omrsResidencyType = "";
  }


  var omrsOccupationValue = utils.getConceptValue(incomingEncounter.encounter.obs, "4587542b-f1aa-47ad-8bed-75a705433950");
  if (utils.isFineValue(omrsOccupationValue) == true && utils.isFineValue(omrsOccupationValue.name) == true && utils.isFineValue(omrsOccupationValue.name.name) == true) {
    omrsOccupationValue = omrsOccupationValue.uuid;
  } else {
    omrsOccupationValue = "";
  }


  var omrsOccupationType = utils.getConceptValue(incomingEncounter.encounter.obs,"3cd97286-26fe-102b-80cb-0017a47871b2");
  if (utils.isFineValue(omrsOccupationType) == true && utils.isFineValue(omrsOccupationType.uuid) == true && utils.isFineValue(omrsOccupationType.display) == true) {
    omrsOccupationType = omrsOccupationType.uuid;
  } else {
    omrsOccupationType = "";
  }


 
  //End of UUID retrieving


  // End of UUID retrieving


  patientAddressObject = utils.getdhis2ProvinceDistrictIds(incomingEncounter.patient);

  
  //Retrieving all the dropdown value from DHIS2
    //Boolean retrieving
  patientDemographicChangeValue = utils.getDHIS2Boolean(omrsDemographicChange);
  patientRiskFactorChangeValue = utils.getDHIS2Boolean(omrsRiskFactorChange);
  patientFollowUpStableValue = utils.getDHIS2Boolean(omrsFollowUpStable);
  patientChangeInTreatmentValue =  utils.getDHIS2Boolean(omrsChangeInTreatment);
  patientAttendedEnhancedCounsellingValue = utils.getDHIS2Boolean(omrsAttendedEnhancedCounselling);
  patientCompletedEnhancedCounsellingValue = utils.getDHIS2Boolean(omrsCompletedEnhancedCounselling);
  
    //End of boolean retrieving

  //getting patient Cellule and Village
  if(patientDemographicChangeValue=="true"){
    patientCellule = patientAddressObject.cellule;
    patientVillage = patientAddressObject.village;
  } 
  
  //This is a dropdown in OpenMRS and free text in DHIS2
  patientOINameValue = utils.getOINameConceptValue(incomingEncounter.encounter.obs, '0ae23a5a-15f5-102d-96e4-000c29c2a5d7');
  var patientSectorDetails = incomingEncounter.patient.person.preferredAddress.cityVillage;
  var patientDistrictDetails = incomingEncounter.patient.person.preferredAddress.countyDistrict;

  utils.getDHIS2DistritctOrSectorId(patientSectorDetails,5,function(result){
    if(patientDemographicChangeValue == "true"){
      patientSecteur = result;
    }
    utils.getDHIS2DistritctOrSectorId(patientDistrictDetails,3,function(result){
      if(patientDemographicChangeValue == "true"){
        patientDistrict = result;
      }
      utils.getDhis2DropdownValue(utils.getDHIS2ReasonARTChangedOrStopped(omrsReasonARTChangedOrStopped), function(result){
        patientReasonARTChangedOrStoppedValue = result;
        utils.getDhis2DropdownValue(utils.getDHIS2DrugToxicityType(omrsDrugToxicityType), function(result){
          patientDrugToxicityTypeValue = result;
          utils.getDhis2DropdownValue(utils.getDHIS2CBSClientOutcome(omrsCBSClientOutcome), function(result){
            patientCBSClientOutcomeValue = result;
            utils.getDhis2DropdownValue(utils.getDHIS2OverAllTreatmentAdherence(omrsOverallTreatmentAdherence), function(result){
              patientOverallTreatmentAdherenceValue = result;
              utils.getDhis2DropdownValue(utils.getDHIS2ClientTPTOutcome(omrsClientTPTOutcome), function(result){
                patientClientTPTOutcomeValue = result;
                utils.getDhis2DropdownValue(utils.getDHIS2TPTTherapyInProgress(omrsTPTTherapyInProgress), function(result){
                  patientTPTTherapyInProgressValue = result;
                  utils.getDhis2DropdownValue(utils.getDHIS2WHOStage(omrsWHOStage), function(result){
                    patientWHOStageValue = result;
                    utils.getDhis2DropdownValue(utils.getDHIS2ResidencyType(omrsResidencyType), function(result){
                      if(patientDemographicChangeValue == "true"){
                        patientResidencyTypeValue = result;
                      }
                      utils.getDhis2DropdownValue(utils.getPatientMaritalStatusDhis2Id(incomingEncounter.patient), function (result) {
                        if(patientDemographicChangeValue == "true"){
                          patientMaritalStatus = result;
                        }
                        utils.getDhis2DropdownValue(utils.getDHIS2Occupation(omrsOccupationValue), function (result) {
                          if(patientDemographicChangeValue == "true"){
                            patientOccupation = result;
                          }
                          utils.getDhis2DropdownValue(utils.getDHIS2OccupationType(omrsOccupationType), function (result) {
                            if(patientDemographicChangeValue == "true"){
                              patientOccupationTypeValue = result;
                            }
              
      //End of retrieving all the dropdown value from DHIS2

                        //DHIS2 json payload update before pushing
                            var dhis2FollowupStructure =
                              {
                                "program": "CYyICYiO5zo",
                                "orgUnit": organizationUnit,
                                "eventDate": eventDate,
                                "status": "COMPLETED",
                                "storedBy": "Savics",
                                "programStage": "Em0sRsnHjoR",
                                "trackedEntityInstance": trackedEntityInstanceId,
                                "enrollment": enrollmentId,
                                "dataValues": [
                                  {
                                    "dataElement": "pbeBAIly2GT",
                                    "value": organizationUnit
                                  },
                                  {
                                    "dataElement": "txsxKp2l6y9",
                                    "value": eventDate
                                  },
                                  {
                                    "dataElement": "oLqMrGMI4Uf",
                                    "value": eventDate
                                  },
                                  {
                                    "dataElement":"Vrm4tEU28YG",
                                    "value": patientVillage
                                  },
                                  {
                                    "dataElement": "fEX1sjE7mEm",
                                    "value": patientCellule
                                  },
                                  {
                                    "dataElement": "I809QdRlgCb",
                                    "value": ""
                                  },
                                  {
                                    "dataElement": "tnMNaBmQaIy",
                                    "value": ""
                                  },
                                  {
                                    "dataElement": "wXcnNSYryUd",
                                    "value": ""
                                  },
                                  {
                                    "dataElement": "OCZt4UJitnh",
                                    "value": patientDemographicChangeValue
                                  },
                                  {
                                    "dataElement": "yu67Iiw64UQ",
                                    "value": ""
                                  },
                                  {
                                    "dataElement": "ZD5gy8Sox8I", 
                                    "value": ""
                                  },
                                  {
                                    "dataElement": "RZBJs5g0DsL",
                                    "value": patientResidencyTypeValue
                                  },
                                  {
                                    "dataElement": "VLl1dlYSt3P",
                                    "value": patientMaritalStatus
                                  },
                                  {
                                    "dataElement": "V2fWNvs7KDL",
                                    "value": patientOccupation
                                  },
                                  {
                                    "dataElement": "Tgt3yKYd2oD",
                                    "value": ""
                                  },
                                  {
                                    "dataElement": "p5U0vUS0Q3V",
                                    "value": ""
                                  },
                                  {
                                    "dataElement": "I79uRgVEyUc",
                                    "value": ""
                                  },
                                  {
                                    "dataElement": "muGUJ70FB50",
                                    "value": patientSecteur
                                  },
                                  {
                                    "dataElement": "hmZLcBkPP6F",
                                    "value": patientDistrict
                                  },
                                  {
                                    "dataElement": "OTAM6B4xZwf",
                                    "value": ""
                                  },
                                  {
                                    "dataElement": "Cgt39EInKQV",
                                    "value": patientOccupationTypeValue
                                  },
                                  {
                                    "dataElement": "KrYJW9kvJS2",
                                    "value": patientRiskFactorChangeValue
                                  },
                                  {
                                    "dataElement": "Nld1zMZwPxK",
                                    "value": ""
                                  },
                                  {
                                    "dataElement": "jYMNto3ELj5",
                                    "value": patientFollowUpStableValue
                                  },
                                  {
                                    "dataElement": "jmwJSKQthb7",
                                    "value": ""
                                  },
                                  {
                                    "dataElement": "xMLGFpVb0Kh",
                                    "value": patientChangeInTreatmentValue
                                  },
                                  {
                                    "dataElement": "KRTWX8CatfN",
                                    "value": ""
                                  },
                                  {
                                    "dataElement": "Nxu3IZxrngL",
                                    "value": patientReasonARTChangedOrStoppedValue
                                  },
                                  {
                                    "dataElement": "gZLYfulH1cx",
                                    "value": ""
                                  },
                                  {
                                    "dataElement": "dlbRyDDWVdz",
                                    "value": patientDrugToxicityTypeValue
                                  },
                                  {
                                    "dataElement": "MWnDK640C17",
                                    "value": patientWHOStageValue
                                  },
                                  {
                                    "dataElement": "MG6I5RT8YsE",
                                    "value": ""
                                  },
                                  {
                                    "dataElement": "LovSZ5zd8YL",
                                    "value": ""
                                  },
                                  {
                                    "dataElement": "ePONK5dlCAl",
                                    "value": ""
                                  },
                                  {
                                    "dataElement": "G3dUs7PuDqx",
                                    "value": patientOINameValue
                                  },
                                  {
                                    "dataElement": "OKemd50jbHG",
                                    "value": ""
                                  },
                                  {
                                    "dataElement": "lrM4jhiDogd",
                                    "value": patientCBSClientOutcomeValue
                                  },
                                  {
                                    "dataElement": "kmA8X0Qwjor",
                                    "value": ""
                                  },
                                  {
                                    "dataElement": "L9lcjEkxHBv",
                                    "value": ""
                                  },
                                  {
                                    "dataElement": "cE0JLRDspz9",
                                    "value": ""
                                  },
                                  {
                                    "dataElement": "eCbwnVkQ8Rt",
                                    "value": ""
                                  },
                                  {
                                    "dataElement": "OO8wNkgpAwK",
                                    "value": patientOverallTreatmentAdherenceValue
                                  },
                                  {
                                    "dataElement": "BMf4geBAMFU",
                                    "value": patientAttendedEnhancedCounsellingValue
                                  },
                                  {
                                    "dataElement": "LpDBQwhUZ4U",
                                    "value": patientCompletedEnhancedCounsellingValue
                                  },
                                  {
                                    "dataElement": "yH3otrjN0qZ",
                                    "value": patientClientTPTOutcomeValue
                                  },
                                  {
                                    "dataElement": "EBAuC7pMu4O",
                                    "value": ""
                                  },
                                  {
                                    "dataElement": "nQGHwHA3ayC",
                                    "value": patientTPTTherapyInProgressValue
                                  }

                                ]
                            };
                            
                            //Beginnig data Pushing form 3 : FOLLOW UP
                            formMapping.pushFormToDhis2(formMapping.form3MappingTable, incomingEncounter, dhis2FollowupStructure, 5, null, function (error, result) {
                              if (error) {
                                winston.error('An error occured when trying to add a follow up information', error);
                                callback('An error occured when trying to add a follow up information');
                              } else {
                                winston.info('Follow up information added with success', result);
                                callback(null, 'Follow up information added with success');
                              }
                            })
                            //End data Pushing form 3 : FOLLOW UP


                          });  
                        });
                      });
                    });  
                  });
                });
              });
            });
          });
        });
      });
    });
  }); 
};
//End of the FOLLOW UP


//Beginning of the form 4: RECENCY VIRAL LOAD
var addRecencyVL = function (incomingEncounter, organizationUnit, trackedEntityInstanceId, enrollmentId, callback) {
  

  //Declaration of all the variables for DHIS2 dropdown and patient data
  var patientVLFinalRitaInconclusiveValue = "";
  var patientVLFinalRitaRecencyResultValue = "";
  var patientBirhDate = "";
  var patientResidencyTypeValue = "";
  var patientOccupationTypeValue = "";
  var patientGender = "";
  var patientMaritalStatus = "";
  var patientOccupation = ""; // Employment status
  var patientAddressObject = "";
  var patientCellule = "";
  var patientVillage = "";
  var patientSecteur = "";
  var patientDistrict = "";

  //Reporting date in DHIS2 must be the encounterDate
  var eventDate = utils.convertToDate(incomingEncounter.encounter.encounterDatetime);

  //Retrieving data
  var omrsVLFinalRitaInconclusive = utils.getConceptValue(incomingEncounter.encounter.obs, "ba4b8a83-54ab-44f3-a7c5-4495ddf055bc");
  if (utils.isFineValue(omrsVLFinalRitaInconclusive) == true && utils.isFineValue(omrsVLFinalRitaInconclusive.name) == true && utils.isFineValue(omrsVLFinalRitaInconclusive.name.name) == true) {
    omrsVLFinalRitaInconclusive = omrsVLFinalRitaInconclusive.uuid;
  } else {
    omrsVLFinalRitaInconclusive = "";
  }

  var omrsVLFinalRitaRecencyResult = utils.getConceptValue(incomingEncounter.encounter.obs, "a2053e28-9ce9-4647-8a96-6f1b7c62f429");
  if (utils.isFineValue(omrsVLFinalRitaRecencyResult) == true && utils.isFineValue(omrsVLFinalRitaRecencyResult.name) == true && utils.isFineValue(omrsVLFinalRitaRecencyResult.name.name) == true) {
    omrsVLFinalRitaRecencyResult = omrsVLFinalRitaRecencyResult.uuid;
  } else {
    omrsVLFinalRitaRecencyResult = "";
  }


  var omrsOccupationValue = utils.getConceptValue(incomingEncounter.encounter.obs, "4587542b-f1aa-47ad-8bed-75a705433950");
  if (utils.isFineValue(omrsOccupationValue) == true && utils.isFineValue(omrsOccupationValue.name) == true && utils.isFineValue(omrsOccupationValue.name.name) == true) {
    omrsOccupationValue = omrsOccupationValue.uuid;
  } else {
    omrsOccupationValue = "";
  }


  var omrsResidencyType = utils.getConceptValue(incomingEncounter.encounter.obs, "59525e15-fc5e-4bc4-9e29-87954348c15f");
  if (utils.isFineValue(omrsResidencyType) == true && utils.isFineValue(omrsResidencyType.name) == true && utils.isFineValue(omrsResidencyType.name.name) == true) {
    omrsResidencyType = omrsResidencyType.uuid;
  } else {
    omrsResidencyType = "";
  }
  
  var omrsOccupationType = utils.getOccupationTypeConcept(incomingEncounter.patient);
  if (utils.isFineValue(omrsOccupationType) == true && utils.isFineValue(omrsOccupationType.uuid) == true && utils.isFineValue(omrsOccupationType.display) == true) {
    omrsOccupationType = omrsOccupationType.uuid;
  } else {
    omrsOccupationType = "";
  }



  if (utils.isFineValue(incomingEncounter.patient.person.birthdate) == true) {
    patientBirhDate = utils.convertToDate(incomingEncounter.patient.person.birthdate);
  }

  patientAddressObject = utils.getdhis2ProvinceDistrictIds(incomingEncounter.patient);

  //getting patient Cellule and Village
  patientCellule = patientAddressObject.cellule;
  patientVillage = patientAddressObject.village;
  var patientSectorDetails = incomingEncounter.patient.person.preferredAddress.cityVillage;
  var patientDistrictDetails = incomingEncounter.patient.person.preferredAddress.countyDistrict;

  utils.getDHIS2DistritctOrSectorId(patientSectorDetails,5,function(result){
    patientSecteur = result;
    utils.getDHIS2DistritctOrSectorId(patientDistrictDetails,3,function(result){
      patientDistrict = result;

      utils.getDhis2DropdownValue(utils.getDHIS2YesNoResponse(omrsVLFinalRitaInconclusive), function (result) {
        patientVLFinalRitaInconclusiveValue = result;
        utils.getDhis2DropdownValue(utils.getDHIS2FinalRitaRecencyResult(omrsVLFinalRitaRecencyResult), function (result) {
          patientVLFinalRitaRecencyResultValue = result;
          utils.getDhis2DropdownValue(utils.getDHIS2Occupation(omrsOccupationValue), function (result) {
            patientOccupation = result;
            var patientTestDone = (utils.isFineValue(patientVLFinalRitaRecencyResultValue))? "yes":"";
            utils.getDhis2DropdownValue(utils.getDHIS2ResidencyType(omrsResidencyType), function (result) {
              patientResidencyTypeValue = result;
              utils.getDhis2DropdownValue(utils.getDHIS2OccupationType(omrsOccupationType), function (result) {
                patientOccupationTypeValue = result;
                utils.getDhis2DropdownValue(utils.getPatientGenderDhis2Id(incomingEncounter.patient), function (result) {
                  patientGender = result;
                  utils.getDhis2DropdownValue(utils.getPatientMaritalStatusDhis2Id(incomingEncounter.patient), function (result) {
                    patientMaritalStatus = result;
                  
                    var dhis2EnrollementStructureVL =  {
                      "program": "CYyICYiO5zo",
                      "orgUnit": organizationUnit,
                      "eventDate": eventDate,
                      "status": "COMPLETED",
                      "storedBy": "Savics",
                      "programStage": "pBAeqPjnhdF",
                      "trackedEntityInstance": trackedEntityInstanceId,
                      "enrollment": enrollmentId,
                      "dataValues": [
                        {
                          "dataElement": "pbeBAIly2GT",
                          "value": organizationUnit
                        },
                        {
                          "dataElement": "txsxKp2l6y9",
                          "value": eventDate
                        },
                        {
                          "dataElement": "oLqMrGMI4Uf",
                          "value": eventDate
                        },
                        {
                          "dataElement": "GwCiJLY0of4",
                          "value": patientBirhDate
                        },
                        {
                          "dataElement": "c4KsTiEImGx",
                          "value": patientGender
                        },
                        {
                          "dataElement": "PZo2sP0TOb6",
                          "value": patientMaritalStatus
                        },
                        {
                          "dataElement": "ZvH6DY75uR1",
                          "value": patientResidencyTypeValue
                        },
                        {
                          "dataElement": "NrWXvZg3WtW",
                          "value": patientOccupation
                        },
                        {
                          "dataElement": "I809QdRlgCb",
                          "value": ""
                        },
                        {
                          "dataElement": "tnMNaBmQaIy",
                          "value": ""
                        },
                        {
                          "dataElement": "wXcnNSYryUd",
                          "value": ""
                        },
                        {
                          "dataElement": "OCZt4UJitnh",
                          "value": ""
                        },
                        {
                          "dataElement": "yu67Iiw64UQ",
                          "value": ""
                        },
                        {
                          "dataElement": "p5U0vUS0Q3V",
                          "value": patientVillage
                        },
                        {
                          "dataElement": "I79uRgVEyUc",
                          "value": patientCellule
                        },
                        {
                          "dataElement": "UaCDJMTQRLz",
                          "value": patientSecteur
                        },
                        {
                          "dataElement": "kPkjR4qEhhn",
                          "value": patientDistrict
                        },
                        {
                          "dataElement": "OTAM6B4xZwf",
                          "value": ""
                        },
                        {
                          "dataElement": "Cgt39EInKQV",
                          "value": patientOccupationTypeValue
                        },
                        {
                          "dataElement": "KrYJW9kvJS2",
                          "value": ""
                        },
                        {
                          "dataElement": "Nld1zMZwPxK",
                          "value": ""
                        },
                        {
                          "dataElement": "jYMNto3ELj5",
                          "value": ""
                        },
                        {
                          "dataElement": "jmwJSKQthb7",
                          "value": ""
                        },
                        {
                          "dataElement": "xMLGFpVb0Kh",
                          "value": ""
                        },
                        {
                          "dataElement": "KRTWX8CatfN",
                          "value": ""
                        },
                        {
                          "dataElement": "Nxu3IZxrngL",
                          "value": ""
                        },
                        {
                          "dataElement": "gZLYfulH1cx",
                          "value": ""
                        },
                        {
                          "dataElement": "dlbRyDDWVdz",
                          "value": ""
                        },
                        {
                          "dataElement": "MWnDK640C17",
                          "value": ""
                        },
                        {
                          "dataElement": "MG6I5RT8YsE",
                          "value": ""
                        },
                        {
                          "dataElement": "LovSZ5zd8YL",
                          "value": ""
                        },
                        {
                          "dataElement": "ePONK5dlCAl",
                          "value": ""
                        },
                        {
                          "dataElement": "G3dUs7PuDqx",
                          "value": ""
                        },
                        {
                          "dataElement": "OKemd50jbHG",
                          "value": ""
                        },
                        {
                          "dataElement": "lrM4jhiDogd",
                          "value": ""
                        },
                        {
                          "dataElement": "kmA8X0Qwjor",
                          "value": ""
                        },
                        {
                          "dataElement": "L9lcjEkxHBv",
                          "value": ""
                        },
                        {
                          "dataElement": "eCbwnVkQ8Rt",
                          "value": ""
                        },
                        {
                          "dataElement": "OO8wNkgpAwK",
                          "value": ""
                        },
                        {
                          "dataElement": "BMf4geBAMFU",
                          "value": ""
                        },
                        {
                          "dataElement": "LpDBQwhUZ4U",
                          "value": ""
                        },
                        {
                          "dataElement": "yH3otrjN0qZ",
                          "value": ""
                        },
                        {
                          "dataElement": "EBAuC7pMu4O",
                          "value": ""
                        },
                        {
                          "dataElement": "nQGHwHA3ayC",
                          "value": ""
                        },
                        {
                          "dataElement": "qBYsHDuUBIv",
                          "value": patientVLFinalRitaRecencyResultValue
                        },
                        {
                          "dataElement": "Tgt3yKYd2oD",
                          "value": ""
                        },
                        {
                          "dataElement": "nMJKcTFHGj0",
                          "value": patientVLFinalRitaInconclusiveValue
                        },
                        {
                          "dataElement": "Ba8VCAO9Nqi",
                          "value": ""
                        },
                        {
                          "dataElement": "yu2bxd3xVIg",
                          "value": ""
                        },
                        {
                          "dataElement": "ptZMCKSxvU8",
                          "value": ""
                        },
                        {
                          "dataElement": "U8zMohYMqHi",
                          "value": eventDate
                        },
                        {
                          "dataElement": "ccYYcYf78sz",
                          "value": patientTestDone
                        }

                      ]
                    }


                    //Beginning data pushing form 4
                    formMapping.pushFormToDhis2(formMapping.form4MappingTable, incomingEncounter, dhis2EnrollementStructureVL, 6, null, function (error, result) {
                      if (error) {
                        winston.error('An error occured when trying to add a recency VL information', error);
                        callback('An error occured when trying to add a recency VL information');
                      } else {
                        winston.info('Recency VL information added with success', result);
                        callback(null, 'Recency VL information added with success');
                      }
                    });
                    //End data pushing form 4


                  });
                });
              });
            });
          });
        });
      });
    });
  });
};
//End of the form 4: RECENCY VIRAL LOAD





/**
 * start - starts the mediator
 *
 * @param  {Function} callback a node style callback that is called once the
 * server is started
 */
function start(callback) {
  if (apiConf.api.trustSelfSigned) { process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0' }

if (apiConf.register) {
//if (false) {
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

          // Create and start HTTPS server
          /*var httpsServer = https.createServer({
              key: fs.readFileSync('./config/certificates/privkey.pem'),
              cert: fs.readFileSync('./config/certificates/cert.pem')
          }, app);*/

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

    // Create and start HTTPS server
    /*  var httpsServer = https.createServer({
          key: fs.readFileSync('../config/certificates/privkey.pem'),
          cert: fs.readFileSync('../config/certificates/cert.pem')
      }, app);*/
    const server = app.listen(port, () => callback(server))

  }
}
exports.start = start

if (!module.parent) {
  // if this script is run directly, start the server
  start(() => winston.info(`Listening on ${port}...`))
}
