type Env = {
  IMAGES_BUCKET?: R2Bucket;
  MV_IMAGES?: R2Bucket;
  PUBLIC_IMAGES_BASE_URL?: string;
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export async function onRequestGet(context: { env: Env }): Promise<Response> {
  const bucket = context.env.IMAGES_BUCKET ?? context.env.MV_IMAGES;
  const bucketBindingName = context.env.IMAGES_BUCKET ? 'IMAGES_BUCKET' : context.env.MV_IMAGES ? 'MV_IMAGES' : null;
  const baseUrl = context.env.PUBLIC_IMAGES_BASE_URL ? context.env.PUBLIC_IMAGES_BASE_URL.replace(/\/+$/, '') : '';

  let sampleKeys: string[] = [];
  if (bucket) {
    try {
      const listed = await bucket.list({ prefix: 'shellandbrush/', limit: 5 });
      sampleKeys = (listed?.objects || []).map((obj) => obj.key);
    } catch (err) {
      return json(
        {
          ok: false,
          error: 'bucket_list_failed',
          env: {
            hasBucketIMAGES: !!context.env.IMAGES_BUCKET,
            hasBucketMV: !!context.env.MV_IMAGES,
            bucketInUse: bucketBindingName,
            hasPublicBaseUrl: !!context.env.PUBLIC_IMAGES_BASE_URL,
          },
          prefixTest: 'shellandbrush/',
          list: { keys: [], count: 0 },
          exampleUrl: null,
        },
        500
      );
    }
  }

  return json({
    ok: true,
    env: {
      hasBucketIMAGES: !!context.env.IMAGES_BUCKET,
      hasBucketMV: !!context.env.MV_IMAGES,
      bucketInUse: bucketBindingName,
      hasPublicBaseUrl: !!context.env.PUBLIC_IMAGES_BASE_URL,
    },
    prefixTest: 'shellandbrush/',
    list: { keys: sampleKeys, count: sampleKeys.length },
    exampleUrl: baseUrl && sampleKeys[0] ? `${baseUrl}/${sampleKeys[0]}` : null,
  });
}
