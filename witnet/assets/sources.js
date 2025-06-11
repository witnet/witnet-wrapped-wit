const { assets, utils, Witnet } = require("@witnet/sdk")
const { RadonScript, retrievals, types } = Witnet.Radon

module.exports = {
  // path: { ... path: {
  /// //// HTTP-GET RETRIEVALS /////////////////////////////////////////////////////
  //      RadonRetrievalXX1: retrievals.HttpGet(
  //          url: "http-or-https://authority/path?query",
  //          headers?: {
  //              "http-header-tag": "http-header-value",
  //              ...,
  //          },
  //          script?: Witnet.Radon.Script()..,
  //      }),
  /// //// HTTP-POST RETRIEVALS ////////////////////////////////////////////////////
  //      RadonRetrievalXX2: retrievals.HttpPost(
  //          url: "http-or-https://authority/path?query",
  //          body?: "...",
  //          headers?: {
  //              "http-header-tag": "http-header-value",
  //              ...,
  //          },
  //          script?: Witnet.Radon.Script()..,
  //      }),
  /// //// GRAPH-QL QUERIES ////////////////////////////////////////////////////////
  //      RadonRetrievalXX3: retrievals.GraphQLQuery(
  //          url: "http-or-https://authority/path?query",
  //          query: "...",
  //          headers?: {
  //              "http-header-tag": "http-header-value",
  //              ...,
  //          },
  //          script?: Witnet.Radon.Script()..,
  //      }),
  // }, ... },
}
