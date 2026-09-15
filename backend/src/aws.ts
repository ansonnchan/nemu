// Production storage: archive raw batches in S3 and commit queryable records in DynamoDB.
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import type { Store, Item } from './service.js';
import type { Batch, Interval } from './model.js';

export class AWSStore implements Store {
  db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  s3 = new S3Client({});
  constructor(
    public table: string,
    public bucket: string,
  ) {}
  async get(pk: string, sk: string) {
    return (
      await this.db.send(
        new GetCommand({ TableName: this.table, Key: { pk, sk }, ConsistentRead: true }),
      )
    ).Item as Item | undefined;
  }
  async put(item: Item, absent = false) {
    await this.db.send(
      new PutCommand({
        TableName: this.table,
        Item: item,
        ...(absent ? { ConditionExpression: 'attribute_not_exists(pk)' } : {}),
      }),
    );
  }
  // Consume the token and create its browser session together; only one redeemer can succeed.
  async pair(tokenKey: string, session: Item, now: number) {
    await this.db.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Delete: {
              TableName: this.table,
              Key: { pk: tokenKey, sk: 'TOKEN' },
              ConditionExpression: 'attribute_exists(pk) AND expiresAt > :now',
              ExpressionAttributeValues: { ':now': now },
            },
          },
          {
            Put: {
              TableName: this.table,
              Item: session,
              ConditionExpression: 'attribute_not_exists(pk)',
            },
          },
        ],
      }),
    );
  }
  async requestSync(device: string, now: number) {
    await this.put({
      pk: `DEVICE#${device}`,
      sk: 'COMMAND#SYNC',
      requestedAt: new Date(now * 1000).toISOString(),
      expiresAt: now + 600,
    });
  }
  async takeSync(device: string, now: number) {
    const result = await this.db.send(
      new DeleteCommand({
        TableName: this.table,
        Key: { pk: `DEVICE#${device}`, sk: 'COMMAND#SYNC' },
        ReturnValues: 'ALL_OLD',
      }),
    );
    return Boolean(result.Attributes && result.Attributes.expiresAt > now);
  }
  async archive(b: Batch, digest: string) {
    const date = b.intervals[0].started_at.slice(0, 10).replaceAll('-', '/');
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: `raw/${b.device_id}/${date}/${b.batch_id}/${digest}.json`,
        Body: JSON.stringify(b),
        ContentType: 'application/json',
        ServerSideEncryption: 'AES256',
      }),
    );
  }
  // Receipt, intervals, and chronological watermark either all commit or all stay unchanged.
  async ingest(b: Batch, digest: string, now: number) {
    const pk = `DEVICE#${b.device_id}`,
      end = b.intervals.at(-1)!.ended_at;
    await this.db.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: this.table,
              Item: { pk, sk: `BATCH#${b.batch_id}`, hash: digest, expiresAt: now + 30 * 86400 },
              ConditionExpression: 'attribute_not_exists(pk)',
            },
          },
          {
            Update: {
              TableName: this.table,
              Key: { pk, sk: 'META' },
              UpdateExpression:
                'SET lastSynced = :now, lastEnd = :end, lastBatchID = :batch, lastBatchHash = :hash',
              ConditionExpression:
                'attribute_exists(pk) AND (attribute_not_exists(lastEnd) OR lastEnd <= :start)',
              ExpressionAttributeValues: {
                ':now': new Date(now * 1000).toISOString(),
                ':end': end,
                ':start': b.intervals[0].started_at,
                ':batch': b.batch_id,
                ':hash': digest,
              },
            },
          },
          ...b.intervals.map((v) => ({
            Put: {
              TableName: this.table,
              Item: {
                pk,
                sk: `INTERVAL#${v.started_at}#${v.id}`,
                interval: v,
                expiresAt: now + 30 * 86400,
              },
              ConditionExpression: 'attribute_not_exists(pk)',
            },
          })),
        ],
      }),
    );
  }
  async intervals(device: string, from: string, to: string) {
    const items: Interval[] = [];
    let cursor: Record<string, any> | undefined;
    // DynamoDB pages results; TTL deletion is eventual, so also check expiry before returning records.
    do {
      const r = await this.db.send(
        new QueryCommand({
          TableName: this.table,
          KeyConditionExpression: 'pk = :pk AND sk BETWEEN :from AND :to',
          ExpressionAttributeValues: {
            ':pk': `DEVICE#${device}`,
            ':from': `INTERVAL#${from}`,
            ':to': `INTERVAL#${to}`,
          },
          ConsistentRead: true,
          ExclusiveStartKey: cursor,
        }),
      );
      for (const i of r.Items ?? [])
        if (i.expiresAt > Math.floor(Date.now() / 1000)) items.push(i.interval as Interval);
      cursor = r.LastEvaluatedKey;
    } while (cursor);
    return items;
  }
}
