const { assets, Witnet } = require("@witnet/sdk")
const { RadonRequest, RadonScript } = Witnet.Radon
const { filters, reducers, retrievals, types } = Witnet.Radon

const sources = require("./sources")
const templates = require("./templates")

module.exports = {
  /// //// REQUESTS FROM RETRIEVALS /////////////////////////////////////////////////
  // path: { ... path: {
  //      WitOracleRequestXXX: new RadonRequest({
  //          sources: [ 
  //              sources...RadonRetrieval1,
  //              sources...RadonRetrieval2.foldArgs("value21"),
  //              sources...RadonRetrieval3.foldArgs("value31", "value32"),
  //              retrievals..HttpXXX({ ... })
  //              ... 
  //          ],
  //          sourcesReducer?: reducers..,
  //          witnessReducer?: reducers..,
  //      }),
  /// /// REQUESTS FROM TEMPLATE ///////////////////////////////////////////////////
  //      WitOracleRequestYYY: templates...RadonTemplate1.buildRequest([["arg11", "arg12", ..], ..])
  // }, ... },
};
