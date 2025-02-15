import { BlockedTerm } from "src/entities/blocked-term";
import { Poll } from "src/entities/poll";
import { Server } from "src/entities/server";
import { ServerMember } from "src/entities/server-member";
import { env, PromiseOr } from "src/util";
import { DataSource, EntityTarget, FindOptionsWhere } from "typeorm";

export const dataSource = new DataSource({
  type: "postgres",
  host: env("POSTGRES_HOST", "localhost"),
  port: env("POSTGRES_PORT", 5432),
  database: env("POSTGRES_DB", "vreiheit-discord"),
  username: env("POSTGRES_USER", "vreiheit"),
  password: env("POSTGRES_PASSWORD", "vreiheit"),
  synchronize: true,
  entities: [BlockedTerm, Server, ServerMember, Poll],
  migrations: [],
  subscribers: [],
});
export async function withResource<T>(
  cls: EntityTarget<T>,
  where: FindOptionsWhere<T>,
  fn: (poll: T) => PromiseOr<void>,
) {
  const repo = dataSource.getRepository(cls);
  const result = await repo.findOne({ where });
  await fn(result);
  return repo.save(result);
}
