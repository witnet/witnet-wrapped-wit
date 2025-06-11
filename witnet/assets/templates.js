const { assets, Witnet } = require("@witnet/sdk")
const { RadonModal, RadonScript, RadonTemplate } = Witnet.Radon
const { filters, reducers, retrievals, types } = Witnet.Radon

const sources = require("./sources")

module.exports = {
  /// //// REQUEST TEMPLATES ///////////////////////////////////////////////////////
  // path: { ... path: {
  //      WitOracleRequestTemplateXXX: new RadonTemplate({
  //          sources: [ 
  //              sources..XX1,
  //              // ...
  //              sources..XX2.foldArgs(...args: string[]),
  //              // ...
  //              retrievals..({ ..
  //              // ...
  //          ],
  //          sourcesReducer?: Witnet.Radon.Reducers..,
  //          witnessReducer?: Witnet.Radon.Reducers..,
  //          samples?: {
  //              "test-description-1": [
  //                  [ "..", ... ], // source #0 args (string[])
  //                  ...
  //              ],
  //              ...
  //          }
  //      }),
  //      WitOracleRequestTemplateYYY: new RadonTemplate({
  //          sources: sources..YY1.spawnRetrievals(argIndex = 0, ...values: string[])
  //          sourcesReducer?: reducers..,
  //          witnessReducer?: reducers..,
  //      }),  
  //      ...
  // }, ... },
};
