const core = require('@actions/core');
const github = require('@actions/github');
const { Octokit } = require("@octokit/action");

// regexes determining level of version change
const majorRegex = new RegExp("^(major|breaking|BREAKING)(\(.+\)):.*");
const minorRegex = new RegExp("^(feat|minor)(\(.+\)):.*");
const patchRegex = new RegExp("^(fix|perf|refactor)(\(.+\)):.*");

// github client
const octokit = new Octokit({
  auth: core.getInput('GITHUB_TOKEN')
});

// scope
const scope = {
  repo: {
    owner: github.context.payload.repository.owner.name,
    name: github.context.payload.repository.name
  },
  commitish: github.context.payload.commits[github.context.payload.commits.length - 1].id
};

// program

let newRelease = createNewRelease();

if(!newRelease){
  console.log('No need for new release');
  core.setOutput('new-release-created', false);
}

core.setOutput('new-release-created', true);
core.setOutput('new-version', newRelease);


async function createNewRelease(commits, currentVersion){

  // get latest release
  let latestRelease = await getLatestRelease();
  // get commtis after last release
  let newCommits = getNewCommits(latestRelease.commitSha);
  // calculate new version based on last release and new commits
  let newVersion = calculateNewVersion(newCommits, latestRelease.version);

  if(!newVersion)
    return undefined;

  // creates new release  
  await octokit.request('POST /repos/{owner}/{repo}/releases', {
    owner: scope.repo.owner,
    repo: scope.repo.name,
    tag_name: newVersion,
    target_commitish: scope.comitish,
    name: newVersion,
    body: 'Description of the release',
    draft: false,
    prerelease: false,
    generate_release_notes: true
  })

  return newVersion;  

}

async function getLatestRelease(){

  // gets latest version from github api
  let latestRelease = await octokit.request('GET /repos/{owner}/{repo}/releases/latest', {
    owner: scope.repo.owner,
    repo: scope.repo.name
  });

  if(!latestRelease)
    throw new Error('Could not find any releases');

  // gets reference of last release
  let latestReleaseRef = await octokit.request('GET /repos/{owner}/{repo}/git/ref/{ref}', {
    owner: 'OWNER',
    repo: 'REPO',
    ref: latestRelease.tag_name
  });  

  // throw exception if last commit didn't reference a commit
  if(!latestReleaseRef || !latestReleaseRef.object.type == 'commit')
    throw new Error('Latest relase is not referencing a commit');

  return {
    version: latestRelease.name,
    commitSha: latestReleaseRef.object.sha
  };

}

async function getNewCommits(limitorSha){      
   

  // gets all commits
  let commits = await octokit.request('GET /repos/{owner}/{repo}/commits', {
    owner: scope.repo.owner,
    repo: scope.repo.name
  });
  
  // loops throug array of commmit starting from newest
  var newCommits = [];
  for(let i = commits.length - 1; i >= 0; i--){
    
    let commit = commits[i].commit;;

    // breaks when we reach same commit as limitor
    if(commit.sha == limitorSha)
      break;

    // adds commit sha and message to array of new commits
    newCommits[newCommits.length] = {
      sha: commit.sha,
      message: commit.message
    };
  }

  // returns new commits since sha 
  return newCommits.reverse();

}

function calculateNewVersion(commits, verString){

  letCurrentVersion = splitVerison(verString);

  let major = false;
  let minor = false;
  let patch = false;

  for(let i = 0; i < commits.length; i++){

    let commit = commits[i];

    if(commit.message.match(majorRegex))
      major = true;

    if(commit.message.match(minorRegex))
      minor = true;

    if(commit.message.match(patchRegex))
      patch = true;
  }

  if(major)
    return formatVersion(currentVersion.major + 1, 0, 0);
  else if(minor)
    return formatVersion(currentVersion.major, currentVersion.minor + 1, 0);
  else if(patch)
    return formatVersion(currentVersion.major, currentVersion.minor, currentVersion.patch + 1);
  else
    return null;

}

function formatVersion(major, minor, patch){
  return 'v' + major + '.' + minor + '.' + patch; 
}

function splitVerison(verStr){

  vetStr.replace('v', '');
  let arr = vetStr.splice('.');

  return {
    major: arr[0],
    minor: arr[1],
    patch: arr[2]
  };

}
