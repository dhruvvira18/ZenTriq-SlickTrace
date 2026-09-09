import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("postgresql://postgres.iwojfwlkrcjwzkecizmg:%24l1ckTr%40ce%216@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres")
SUPABASE_KEY = os.getenv("ZenTriq!1209")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError(
        "SUPABASE_URL and SUPABASE_KEY must be set in the .env file"
    )

supabase: Client = create_client(
    SUPABASE_URL,
    SUPABASE_KEY
)

BUCKET_NAME = "oil-spill-images"


def upload_spill_image(
    image_bytes: bytes,
    file_path: str,
    content_type: str
):
    """
    Upload the original satellite image to Supabase Storage.
    """

    response = (
        supabase.storage
        .from_(BUCKET_NAME)
        .upload(
            path=file_path,
            file=image_bytes,
            file_options={
                "content-type": content_type,
                "upsert": "false"
            }
        )
    )

    # Generate URL for the uploaded image
    public_url = (
        supabase.storage
        .from_(BUCKET_NAME)
        .get_public_url(file_path)
    )

    return public_url


def insert_oil_spill(spill_data: dict):
    """
    Insert a new oil-spill record into the history table.
    """

    response = (
        supabase
        .table("oil_spill_history")
        .insert(spill_data)
        .execute()
    )

    return response.data