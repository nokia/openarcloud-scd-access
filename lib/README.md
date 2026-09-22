Simple client library for the Open AR Cloud Spatial Content Discovery.
More information about the discovery services used can be found here:

Spatial Service Discovery
- [https://github.com/OpenArCloud/oscp-spatial-service-discovery](https://github.com/OpenArCloud/oscp-spatial-service-discovery)

Spatial Content Discovery
- [https://github.com/OpenArCloud/oscp-spatial-content-discovery](https://github.com/OpenArCloud/oscp-spatial-content-discovery)


### New with version 0.4.0:
- Optional no-auth/dev `init` (empty or `"disabled"` Auth0 settings)
- Svelte is a peer dependency; Svelte 4 and Svelte 5 are supported

### New with version 0.2.0:
- **Breaking changes**
- conversion from JavaScript to TypeScript

### New with version 0.1.6:
- updated SCR schema with new geopose standard and to accept empty array of definitions

### New with version 0.1.5:
- fixed potential URL problems in getContentsAtLocation()

### New with version 0.1.2:
- **breaking changes**
- changed service URLs to contain `scrsPath`
- renamed `searchContentForTenant` to `searchContentsForTenant`
- renamed `getContentAtLocation` to `getContentsAtLocation` but kept the old one for compatibility
- small fixes, formatting, comments
- update README.md

### New with version 0.1.1:
- **breaking changes**
- Auth0 context must be set from the application that calls this library
- Added URL of Content Discovery to use as a parameter to the functions

### New with version 0.1.0:
- **Breaking changes**
- Replace `service` in function names with `content`
- Add URL of Content Discovery to use as a parameter to the functions
- Rename `localServices` and `localService` to `localResults` and `localResult`
- Change constant `SCR_URL` to variable `scrUrl` and export it. Allows accessing
  different content discovery services


### Currently available functions are:
    function getContentsAtLocation(url, topic, h3Index)
Requests content available around H3Index from the regional server for the provided
countryCode

    function getContentWithId(url, topic, id)
Requests content with provided id from the regional server for the provided countryCode

    function postContent(url, topic, scr, token)
Post a content to Spatial Content Discovery server of provided region

    function postScrFile(url, topic, file, token)
Post the content of a .json file to Spatial Content Discovery server of provided region

    function putContent(url, topic, scr, id, token)
Send an edited SCR record to the server

    function validateScr(scr, fileName = '')
Validate the provided Spatial Content Record against the SCR json schema

    function searchContentsForTenant(url, topic, token)
Request all content for the current tenant in the provided topic

    function deleteWithId(url, topic, id, token)
Delete the record with the provided id and region


### Authentication

The spatial discovery services use [Auth0](https://auth0.com) for authentication. It uses the [single page app SDK](https://auth0.com/docs/libraries/auth0-single-page-app-sdk) from Auth0. In your main application, you can read the Auth0 configuration from a .env file containing these values:
```
AUTH0_SCD_DOMAIN =
AUTH0_SCD_CLIENTID =
AUTH0_SCD_AUDIENCE =
AUTH0_SCD_SCOPE =
```
and then you can pass these values to this library in the `init` method:

    function init(auth_domain, auth_client_id, auth_audience, auth_scope))
Instantiate and initialize the auth0 object, used for login/logout and api access

    function login()
    function logout()

    function getToken()
Returns the auth0 access token

    authenticated
true when client is logged in

    user
The user record from auth0
