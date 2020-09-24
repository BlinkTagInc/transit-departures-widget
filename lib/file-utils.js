const path = require('path');

const beautify = require('js-beautify').html_beautify;
const fs = require('fs-extra');
const pug = require('pug');
const untildify = require('untildify');

const formatters = require('./formatters');

/*
 * Attempt to parse the specified config JSON file.
 */
exports.getConfig = async argv => {
  try {
    const data = await fs.readFile(path.resolve(untildify(argv.configPath)), 'utf8').catch(error => {
      console.error(new Error(`Cannot find configuration file at \`${argv.configPath}\`. Use config-sample.json as a starting point, pass --configPath option`));
      throw error;
    });
    const config = JSON.parse(data);

    if (argv.skipImport === true) {
      config.skipImport = argv.skipImport;
    }

    return config;
  } catch (error) {
    console.error(new Error(`Cannot parse configuration file at \`${argv.configPath}\`. Check to ensure that it is valid JSON.`));
    throw error;
  }
};

/*
 * Get the full path of the template file for generating transit arrivals widget based on
 * config.
 */
function getTemplatePath(templateFileName, config) {
  let folderPath;
  if (config.templatePath === undefined) {
    folderPath = path.join(__dirname, '..', 'views/widget/');
  } else {
    folderPath = path.join(untildify(config.templatePath));
  }

  const filename = `${templateFileName}${(config.noHead === true) ? '' : '_full'}.pug`;

  return path.join(folderPath, filename);
}

/*
 * Prepare the specified directory for saving HTML timetables by deleting
 * everything and creating the expected folders.
 */
exports.prepDirectory = async exportPath => {
  const staticAssetPath = path.join(__dirname, '..', 'public');
  await fs.remove(exportPath);
  await fs.ensureDir(exportPath);
  await fs.copy(path.join(staticAssetPath, 'css'), path.join(exportPath, 'css'));
  await fs.copy(path.join(staticAssetPath, 'js'), path.join(exportPath, 'js'));
};

/*
 * Render the HTML based on the config.
 */
exports.renderFile = async (templateFileName, templateVars, config) => {
  const templatePath = getTemplatePath(templateFileName, config);
  const html = await pug.renderFile(templatePath, templateVars);

  // Beautify HTML if setting is set
  if (config.beautify === true) {
    return beautify(html, { indent_size: 2 });
  }

  return html;
};
