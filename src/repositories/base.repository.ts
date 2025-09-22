// export abstract class BaseRepository<TSchema> {
//   constructor(protected db: DrizzleDB, protected table: TSchema) {}

//   abstract findById(id: string): Promise<any>;
//   abstract findMany(filters?: any): Promise<any[]>;
//   abstract create(data: any): Promise<any>;
//   abstract update(id: string, data: any): Promise<any>;
//   abstract delete(id: string): Promise<void>;
// }
