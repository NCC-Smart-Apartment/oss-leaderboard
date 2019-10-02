import fetch from 'node-fetch';

import 'dotenv/config';

import getQuery from './src/query';
import {
  DAYS_TO_CONSIDER,
  eventQueryGenerator,
  events,
  FILE_NAME, MAPPED_USER_EVENT,
  QUERY_NAMES,
  WEIGHT,
} from './src/constants';

import { getKeys, getValues } from './src/util/keyValue';
import { generateMarkdown } from './src/service/generateMarkdown';
import { createMarkdown } from './src/service/createMarkdown';
import { fetchUserEventsFromTo } from './src/service/fetchUserEvents';
import { sort } from './src/util/sort';
import { fetchOrganizationUsers } from './src/service/fetchOrganizationUsers';

const uptoDate = new Date();

uptoDate.setDate(uptoDate.getDate() - DAYS_TO_CONSIDER);

/**
 *
 *
 * @param {*} query
 * @returns
 */
export async function fetchUsers(query) {
  const accessToken = process.env.ACCESS_TOKEN;

  try {
    const res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      body: JSON.stringify(query),
      headers: {
        authorization: `token ${accessToken}`,
      },
    });

    return res.json();
  } catch (error) {
    // TODO
    throw error.response;
  }
}

/**
 *
 *
 */
async function init() {
  const query = getQuery(QUERY_NAMES.MEMBERS_WITH_ROLE);

  try {
    const usersList = await fetchOrganizationUsers(query).catch(err => {
      throw err;
    });

    await Promise.all(
      usersList.map(user => {
        return fetchUserEventsFromTo(
          eventQueryGenerator(Object.values(events), user.login),
          new Date(),
          uptoDate,
        );
      }),
    ).then(res => {
      const usersDetails = {};

      res.forEach((item, index) => {
        usersDetails[usersList[index].name || usersList[index].login] = item;
      });

      let leaderBoard = Object.keys(usersDetails).sort((a, b) => {
        if (
          usersDetails[a].userEventList.length >
          usersDetails[b].userEventList.length
        ) {
          return -1;
        } else if (
          usersDetails[a].userEventList.length ===
          usersDetails[b].userEventList.length
        ) {
          return 0;
        }

        return 1;
      });

      leaderBoard = leaderBoard.map(user => {
        const contribution = {};

        Object.keys(usersDetails[user]).forEach(key => {
          const userContribution = usersDetails[user][key];

          if (typeof userContribution === 'number') {
            contribution[key] = userContribution;
          } else if (userContribution.length > 0) {
            userContribution.map(event => {
              const eventKey = Object.keys(event)[0];
              const state = event[eventKey].state || '';
              const generatedKey =
                eventKey + state.charAt(0) + state.substr(1).toLowerCase();

              if (!contribution[generatedKey]) {
                contribution[generatedKey] = 0;
              }
              contribution[generatedKey]++;
            });
          }
        });

        return Object.assign(
          {},
          {
            name: user,
          },
          contribution,
        );
      });

      const keys = getKeys(leaderBoard);

      leaderBoard = leaderBoard.slice(0, 20).reduce((acc, item) => {
        const temp = Object.assign({}, item);

        if (Object.keys(temp).length <= 2) {
          return acc;
        }
        keys.forEach(key => {
          temp[key] = temp[key] || 0;
        });
        acc.push(temp);

        return acc;
      }, []);
      const sortedLeaderBoard = sort(addScore(leaderBoard), 'score', 'desc');
      const leaderBoardValues = getValues(sortedLeaderBoard, [
        ...keys,
        'score',
      ]);

      generateMarkdown(leaderBoardValues, MAPPED_USER_EVENT).then(
        contributionData => {
          const title = '---\n' +
            'id: leaderboard\n' +
            'title: oss-leaderboard\n' +
            'sidebar_label: leaderboard list\n' +
            '---\n' + contributionData;

          createMarkdown(FILE_NAME, title);
        },
      );
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.log('Error user fetching', error);
  }
}

/**
 * Calculate a score of events.
 *
 * @param {*} e
 * @returns Calculated score by give weights.
 */
function calculateScore(e) {
  return (
    e.pullRequestsMerged * WEIGHT.pullRequestsMerged +
    e.pullRequestsOpen * WEIGHT.pullRequestsOpen +
    e.issueComments * WEIGHT.issueComments +
    e.issuesOpen * WEIGHT.issuesOpen
  );
}

/**
 * Add a score field for each events.
 *
 * @param {*} leaderBoard
 * @returns Event list of user with added score.
 */
function addScore(leaderBoard) {
  return leaderBoard.map(item => ({
    ...item,
    score: calculateScore(item),
  }));
}

init();
