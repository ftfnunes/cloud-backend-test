import { createTestClient } from 'apollo-server-testing';
import { server } from '../../lambda';
import { awsResponse, putFn } from '../../__mocks__/aws-sdk/clients/dynamodb';
import { accessTokenEnvName } from '../../dist/configuration/mapbox';
import { usersTableEnvName } from '../../configuration/users-db';
import { v4 as uuid } from 'uuid';
import moment from 'moment';
import { UserInput } from '../../graphql/types/schema-types';
import { UserModel } from '../../data-access/models/user';

describe('Mutate user', () => {
	const mockUserInput: UserInput = {
		address: 'Brasilia, Brazil',
		dob: '1995-09-03',
		name: 'Test user',
		description: 'Test description',
	};

	const existingUser: UserModel = {
		id: '1234',
		address: 'Rio de Janeiro, Brazil',
		dob: '1995-09-04T00:00:00.000Z',
		name: 'Test user 2',
		description: 'Test description 2',
		createdAt: '2021-05-01T17:52:48.299Z',
	};

	beforeEach(() => {
		jest.clearAllMocks();
	});

	const setup = () => {
		process.env[usersTableEnvName] = 'test-table';
		process.env[accessTokenEnvName] = 'test-access-token';
		const now = moment();
		Date.now = jest.fn().mockReturnValue(now);
		return {
			testclient: createTestClient(server),
			now,
		};
	};

	const getExpectedResults = (now: moment.Moment) => {
		const createdUserModel = {
			...mockUserInput,
			createdAt: now.toISOString(),
			// This uuid is mocked
			id: uuid(),
			dob: moment(mockUserInput.dob).toISOString(),
		};

		const expectedReturnedUser = {
			...createdUserModel,
			updatedAt: null,
			imageUrl: `https://picsum.photos/seed/${uuid()}/200/300`,
		};

		return {
			createdUserModel,
			expectedReturnedUser,
		};
	};

	it('Should create user and return if correct input', async () => {
		const {
			testclient: { mutate },
			now,
		} = setup();

		const result = await mutate({
			mutation: `
                mutation {
                    createUser(data: {
                        name: "${mockUserInput.name}"
                        address: "${mockUserInput.address}"
                        description: "${mockUserInput.description}"
                        dob: "${mockUserInput.dob}"
                     }){
                        id
                        name
                        address
                        dob
                        description
                        createdAt
                        updatedAt
                        imageUrl
                    }
                }
            `,
		});

		const { expectedReturnedUser, createdUserModel } = getExpectedResults(now);
		expect(result.errors).toBeUndefined();
		expect(result.data.createUser).toEqual(expectedReturnedUser);

		expect(putFn).toHaveBeenCalledWith({
			TableName: process.env[usersTableEnvName],
			Item: createdUserModel,
		});
	});

	it('Should return error with invalid input', async () => {
		const {
			testclient: { mutate },
		} = setup();

		const result = await mutate({
			mutation: `
                mutation {
                    createUser(data: {
                        name: "${mockUserInput.name}"
                        address: "${mockUserInput.address}"
                        description: "${mockUserInput.description}"
                        dob: "03-09-1995"
                     }){
                        id
                        name
                        address
                        dob
                        description
                        createdAt
                        updatedAt
                        imageUrl
                    }
                }
            `,
		});

		expect(result.errors).toBeDefined();
		expect(result.errors?.length).toBe(1);
		expect(result.errors?.[0].message).toBe('An invalid date of birth was provided');
		expect(result.data).toBeNull();

		expect(putFn).toHaveBeenCalledTimes(0);
	});

	it('Should update user with valid input', async () => {
		const {
			testclient: { mutate },
			now,
		} = setup();

		awsResponse.mockReturnValueOnce(Promise.resolve({ Item: { ...existingUser } }));
		const mockUserId = '12345';
		const result = await mutate({
			mutation: `
                mutation {
                    updateUser(id: "${mockUserId}", data: {
                        name: "${mockUserInput.name}"
                        address: "${mockUserInput.address}"
                        description: "${mockUserInput.description}"
                        dob: "${mockUserInput.dob}"
                     }){
                        id
                        name
                        address
                        dob
                        description
                        createdAt
                        updatedAt
                        imageUrl
                    }
                }
            `,
		});

		const modifiedUserModel = {
			...existingUser,
			dob: moment(mockUserInput.dob).toISOString(),
			name: mockUserInput.name,
			description: mockUserInput.description,
			address: mockUserInput.address,
			updatedAt: now.toISOString(),
		};

		const expectedReturnedUser = {
			...modifiedUserModel,
			imageUrl: `https://picsum.photos/seed/${existingUser.id}/200/300`,
		};
		expect(result.errors).toBeUndefined();
		expect(result.data.updateUser).toEqual(expectedReturnedUser);

		expect(putFn).toHaveBeenCalledWith({
			TableName: process.env[usersTableEnvName],
			Item: modifiedUserModel,
		});
	});
});
