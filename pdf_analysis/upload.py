import cloudinary
import cloudinary.uploader
import os
import json

URLS_JSON = "urls.json"


def get_image_name(file_name):
    return file_name.split(".png")[0]


def generate_urls_json(urls):
    urls = {"upload photos": urls}
    with open(URLS_JSON, "w", encoding="utf8") as f:
        json.dump(urls, f, indent=4)


def upload_images(PATH_TO_SAVE_IMAGES):
    # Configure Cloudinary
    cloudinary.config(
        cloud_name="ddbsziram",
        api_key="294189893426148",
        api_secret="1rl355v1AH2XcYn9-MkKoZZ1gsM",
    )

    file_names = os.listdir(PATH_TO_SAVE_IMAGES)
    urls = []
    if file_names != []:
        for file_name in file_names:
            image_name = get_image_name(file_name)
            response = cloudinary.uploader.upload(
                os.path.join(PATH_TO_SAVE_IMAGES, file_name), public_id=image_name
            )
            image_url = response["secure_url"]
            urls.append(image_url)
            generate_urls_json(urls)
