"use strict";

const AWS = require("aws-sdk");
const S3 = new AWS.S3({
	region: "us-east-1",
	signatureVersion: "v4"
});
const Sharp = require("sharp");

// set the S3 and API GW endpoints
const BUCKET = "digitalkaleido-static-hosting";

exports.handler = (event, context, callback) => {
	let response = event.Records[0].cf.response;
	//check if image is not present
	if (response.status == 404) {
		let request = event.Records[0].cf.request;
		// read the required path. Ex: uri /images/100x100/webp/image.jpg
		let path = request.uri;

		// read the S3 key from the path variable.
		// Ex: path variable /images/100x100/webp/image.jpg
		// try with https://cdn.digitalkaleido.com/101x101/jpeg/logo.png
		let key = path.substring(1);

		// parse the prefix, width, height and image name
		// Ex: key=images/200x200/webp/image.jpg
		let prefix, originalKey, match, width, height, requiredFormat, imageName;

		try {
			match = key.match(/(.*)\/(\d+)x(\d+)\/(.*)\/(.*)/);
			prefix = match[1];
			width = parseInt(match[2], 10);
			height = parseInt(match[3], 10);

			// correction for jpg required for 'Sharp'
			requiredFormat = match[4] == "jpg" ? "jpeg" : match[4];
			imageName = match[5];
			originalKey = prefix + "/" + imageName;
		} catch (err) {
			// no prefix exist for image..
			console.log("no prefix present..");
			match = key.match(/(\d+)x(\d+)\/(.*)\/(.*)/);
			width = parseInt(match[1], 10);
			height = parseInt(match[2], 10);

			// correction for jpg required for 'Sharp'
			requiredFormat = match[3] == "jpg" ? "jpeg" : match[3];
			imageName = match[4];
			originalKey = imageName;
		}

		// get the source image file
		S3.getObject({ Bucket: BUCKET, Key: originalKey })
			.promise()
			// perform the resize operation
			.then(data =>
				Sharp(data.Body)
					.resize(width, height)
					.toFormat(requiredFormat)
					.toBuffer()
			)
			.then(buffer => {
				// save the resized object to S3 bucket with appropriate object key.
				S3.putObject({
					Body: buffer,
					Bucket: BUCKET,
					ContentType: "image/" + requiredFormat,
					CacheControl: "max-age=31536000",
					Key: key,
					StorageClass: "STANDARD"
				})
					.promise()
					// even if there is exception in saving the object we send back the generated
					// image back to viewer below
					.catch(() => {
						console.log("Exception while writing resized image to bucket");
					});

				// generate a binary response with resized image
				response.status = 200;
				response.body = buffer.toString("base64");
				response.bodyEncoding = "base64";
				response.headers["content-type"] = [
					{ key: "Content-Type", value: "image/" + requiredFormat }
				];
				callback(null, response);
			})
			.catch(err => {
				console.log("Exception while reading source image :%j", err);
			});
	} // end of if block checking response statusCode
	else {
		// allow the response to pass through
		callback(null, response);
	}
};
