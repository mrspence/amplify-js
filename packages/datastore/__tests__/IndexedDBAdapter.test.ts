import Adapter from '../src/storage/adapter/IndexedDBAdapter';
import 'fake-indexeddb/auto';
import {
	DataStore as DataStoreType,
	initSchema as initSchemaType,
} from '../src/datastore/datastore';
import { PersistentModelConstructor, SortDirection } from '../src/types';
import { Model, User, Profile, Post, Comment, testSchema } from './helpers';
import { Predicates } from '../src/predicates';

let initSchema: typeof initSchemaType;
let DataStore: typeof DataStoreType;
// using any to get access to private methods
const IDBAdapter = <any>Adapter;

describe('IndexedDBAdapter tests', () => {
	describe('Query', () => {
		let Model: PersistentModelConstructor<Model>;
		let model1Id: string;
		const spyOnGetOne = jest.spyOn(IDBAdapter, 'getByKey');
		const spyOnGetAll = jest.spyOn(IDBAdapter, 'getAll');
		const spyOnEngine = jest.spyOn(IDBAdapter, 'enginePagination');
		const spyOnMemory = jest.spyOn(IDBAdapter, 'inMemoryPagination');

		beforeAll(async () => {
			({ initSchema, DataStore } = require('../src/datastore/datastore'));

			const classes = initSchema(testSchema());

			({ Model } = classes as {
				Model: PersistentModelConstructor<Model>;
			});

			({ id: model1Id } = await DataStore.save(
				new Model({
					field1: 'Some value',
					dateCreated: new Date().toISOString(),
				})
			));
			await DataStore.save(
				new Model({
					field1: 'another value',
					dateCreated: new Date().toISOString(),
				})
			);
			await DataStore.save(
				new Model({
					field1: 'a third value',
					dateCreated: new Date().toISOString(),
				})
			);
		});

		beforeEach(() => {
			jest.clearAllMocks();
		});

		it('Should call getByKey for query by id', async () => {
			const result = await DataStore.query(Model, model1Id);

			expect(result.field1).toEqual('Some value');
			expect(spyOnGetOne).toHaveBeenCalled();
			expect(spyOnGetAll).not.toHaveBeenCalled();
			expect(spyOnEngine).not.toHaveBeenCalled();
			expect(spyOnMemory).not.toHaveBeenCalled();
		});

		it('Should call getAll & inMemoryPagination for query with a predicate', async () => {
			const results = await DataStore.query(Model, c =>
				c.field1('eq', 'another value')
			);

			expect(results.length).toEqual(1);
			expect(spyOnGetAll).toHaveBeenCalled();
			expect(spyOnEngine).not.toHaveBeenCalled();
			expect(spyOnMemory).toHaveBeenCalled();
		});

		it('Should call getAll & inMemoryPagination for query with sort', async () => {
			const results = await DataStore.query(Model, Predicates.ALL, {
				sort: s => s.dateCreated(SortDirection.DESCENDING),
			});

			expect(results.length).toEqual(3);
			expect(results[0].field1).toEqual('a third value');
			expect(spyOnGetAll).toHaveBeenCalled();
			expect(spyOnEngine).not.toHaveBeenCalled();
			expect(spyOnMemory).toHaveBeenCalled();
		});

		it('Should call enginePagination for query with pagination but no sort or predicate', async () => {
			const results = await DataStore.query(Model, Predicates.ALL, {
				limit: 1,
			});

			expect(results.length).toEqual(1);
			expect(spyOnGetAll).not.toHaveBeenCalled();
			expect(spyOnEngine).toHaveBeenCalled();
			expect(spyOnMemory).not.toHaveBeenCalled();
		});

		it('Should call getAll for query without predicate and pagination', async () => {
			const results = await DataStore.query(Model);

			expect(results.length).toEqual(3);
			expect(spyOnGetAll).toHaveBeenCalled();
			expect(spyOnEngine).not.toHaveBeenCalled();
			expect(spyOnMemory).not.toHaveBeenCalled();
		});
	});

	describe('Delete', () => {
		let User: PersistentModelConstructor<User>;
		let Profile: PersistentModelConstructor<Profile>;
		let profile1Id: string;
		let user1Id: string;
		let Post: PersistentModelConstructor<Post>;
		let Comment: PersistentModelConstructor<Comment>;
		let post1Id: string;
		let comment1Id: string;

		beforeAll(async () => {
			({ initSchema, DataStore } = require('../src/datastore/datastore'));

			const classes = initSchema(testSchema());

			({ User } = classes as {
				User: PersistentModelConstructor<User>;
			});

			({ Profile } = classes as {
				Profile: PersistentModelConstructor<Profile>;
			});

			({ id: profile1Id } = await DataStore.save(
				new Profile({ firstName: 'Rick', lastName: 'Bob' })
			));

			({ id: user1Id } = await DataStore.save(
				new User({ name: 'test', profileID: profile1Id })
			));

			({ Post } = classes as {
				Post: PersistentModelConstructor<Post>;
			});

			({ Comment } = classes as {
				Comment: PersistentModelConstructor<Comment>;
			});

			const post = await DataStore.save(new Post({ title: 'Test' }));
			({ id: post1Id } = post);

			({ id: comment1Id } = await DataStore.save(
				new Comment({ content: 'Test Content', post })
			));
		});

		it('Should perform a cascading delete on a record with a Has One relationship', async () => {
			expect.assertions(4);
			let user = await DataStore.query(User, user1Id);
			let profile = await DataStore.query(Profile, profile1Id);

			// double-checking that both of the records exist at first
			expect(user.id).toEqual(user1Id);
			expect(profile.id).toEqual(profile1Id);

			await DataStore.delete(User, user1Id);

			user = await DataStore.query(User, user1Id);
			profile = await DataStore.query(Profile, profile1Id);

			// both should be undefined, even though we only explicitly deleted the user
			expect(user).toBeUndefined();
			expect(profile).toBeUndefined();
		});

		it('Should perform a cascading delete on a record with a Has Many relationship', async () => {
			expect.assertions(4);
			let post = await DataStore.query(Post, post1Id);
			let comment = await DataStore.query(Comment, comment1Id);

			// double-checking that both of the records exist at first
			expect(post.id).toEqual(post1Id);
			expect(comment.id).toEqual(comment1Id);

			await DataStore.delete(Post, post.id);

			post = await DataStore.query(Post, post1Id);
			comment = await DataStore.query(Comment, comment1Id);

			// both should be undefined, even though we only explicitly deleted the post
			expect(post).toBeUndefined();
			expect(comment).toBeUndefined();
		});
	});

	describe('Save', () => {
		let User: PersistentModelConstructor<User>;
		let Profile: PersistentModelConstructor<Profile>;
		let profile: Profile;

		beforeAll(async () => {
			({ initSchema, DataStore } = require('../src/datastore/datastore'));

			const classes = initSchema(testSchema());

			({ User } = classes as {
				User: PersistentModelConstructor<User>;
			});

			({ Profile } = classes as {
				Profile: PersistentModelConstructor<Profile>;
			});

			profile = await DataStore.save(
				new Profile({ firstName: 'Rick', lastName: 'Bob' })
			);
		});

		it('should allow linking model via model field', async () => {
			expect.assertions(2);

			const savedUser = await DataStore.save(
				new User({ name: 'test', profile })
			);
			const user1Id = savedUser.id;

			const user = await DataStore.query(User, user1Id);
			expect(user.profileID).toEqual(profile.id);
			expect(user.profile).toEqual(profile);
		});

		it('should allow linking model via FK', async () => {
			expect.assertions(2);

			const savedUser = await DataStore.save(
				new User({ name: 'test', profileID: profile.id })
			);
			const user1Id = savedUser.id;

			const user = await DataStore.query(User, user1Id);
			expect(user.profileID).toEqual(profile.id);
			expect(user.profile).toEqual(profile);
		});
	});
});
