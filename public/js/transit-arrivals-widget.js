/* global window, $, jQuery, _, Pbf, FeedMessage, alert, accessibleAutocomplete,  */
/* eslint no-var: "off", no-unused-vars: "off", no-alert: "off" */

function setupTransitArrivalsWidget(routes, stops, config) {
  let arrivalsResponse;
  let arrivalsTimeout;
  let initialStopCode;
  let selectedArrivalParameters;

  function updateUrlWithParameters(stopCode) {
    const url = new URL(window.location.origin + window.location.pathname);
    if (stopCode) {
      url.searchParams.append('stop_id', stopCode);
    }

    window.history.pushState(null, null, url);
  }

  async function fetchTripUpdates() {
    const url = `${config.gtfsRtTripupdatesUrl}?cacheBust=${Date.now()}`;
    const response = await fetch(url);
    if (response.ok) {
      const bufferResponse = await response.arrayBuffer();
      const pbf = new Pbf(new Uint8Array(bufferResponse));
      const object = FeedMessage.read(pbf);

      return object.entity;
    }

    throw new Error(response.status);
  }

  function formatMinutes(seconds) {
    if (seconds < 60) {
      return '&#60;1';
    }

    return Math.floor(seconds / 60);
  }

  function timeStamp() {
    const now = new Date();
    let hours = now.getHours();
    let minutes = now.getMinutes();

    if (minutes < 10) {
      minutes = '0' + minutes;
    }

    if (config.timeFormat === '24hour') {
      return `${hours}:${minutes}`;
    }

    const suffix = hours < 12 ? 'AM' : 'PM';
    hours = hours < 12 ? hours : hours - 12;
    hours = hours || 12;

    return `${hours}:${minutes} ${suffix}`;
  }

  jQuery(($) => {
    // Read URL parameters on load
    readUrlWithParameters();

    function readUrlWithParameters() {
      const url = new URL(window.location.href);
      initialStopCode = url.searchParams.get('stop_id') || undefined;

      if (initialStopCode) {
        // Wait for bootstrap js to initialize before triggering click
        setTimeout(() => {
          $('#stop_id_form').trigger('submit');
          $(
            '#real_time_arrivals input[name="arrival_type"][value="stop_id"]'
          ).trigger('click');
        }, 100);
      }
    }

    function resetResults() {
      if (arrivalsTimeout) {
        clearTimeout(arrivalsTimeout);
      }

      $('#arrival_results').hide();
    }

    function showLoading() {
      $('#loading').show();
    }

    function hideLoading() {
      $('#loading').hide();
    }

    function renderStopInfo(stop) {
      if (stop) {
        $('#arrival_results .arrival-results-stop-unknown').hide();
        $('#arrival_results .arrival-results-stop').text(stop.stop_name).show();
      } else {
        $('#arrival_results .arrival-results-stop').hide();
        $('#arrival_results .arrival-results-stop-unknown').show();
      }

      if (stop && stop.stop_code) {
        $('#arrival_results .arrival-results-stop-code').text(stop.stop_code);
        $('#arrival_results .arrival-results-stop-code-container').show();
      } else {
        $('#arrival_results .arrival-results-stop-code-container').hide();
      }

      $('#arrival_results .arrival-results-fetchtime-time').text(timeStamp());
    }

    function formatArrivalGroup(arrivalGroup) {
      const div = $('<div>').addClass('arrival-result');
      const { route, direction } = arrivalGroup[0];

      const routeNameDiv = $('<div>')
        .addClass('arrival-result-route-name')
        .appendTo(div);
      const arrivalTimesDiv = $('<div>')
        .addClass('arrival-result-times')
        .appendTo(div);

      if (route.route_short_name) {
        const routeColor = route.route_color ? `#${route.route_color}` : '#ccc';
        const routeTextColor = route.route_text_color
          ? `#${route.route_text_color}`
          : '#000';
        $('<div>')
          .text(route.route_short_name)
          .addClass('arrival-result-route-circle')
          .css({
            'background-color': routeColor,
            color: routeTextColor,
          })
          .appendTo(routeNameDiv);
      }

      $('<div>')
        .text(direction.direction)
        .addClass('arrival-result-route-direction')
        .appendTo(routeNameDiv);

      const sortedArrivals = _.take(
        _.sortBy(arrivalGroup, (arrival) => arrival.stoptime.departure.time),
        3
      );

      for (const arrival of sortedArrivals) {
        const minutes = formatMinutes(
          arrival.stoptime.departure.time - Date.now() / 1000
        );
        const minutesLabel = $(
          '#arrival_results .arrival-results-container'
        ).data('minutes-label');

        $('<div>')
          .addClass('arrival-result-time-container')
          .append(
            $('<div>')
              .addClass('arrival-result-time')
              .html(
                `${minutes}<span class="arrival-result-time-label">${minutesLabel}</span>`
              )
          )
          .appendTo(arrivalTimesDiv);
      }

      return div;
    }

    function renderResults(stop, arrivals) {
      renderStopInfo(stop);

      if (arrivals.length === 0) {
        $('#arrival_results .arrival-results-container').hide();
        $('#arrival_results .arrival-results-error').hide();
        $('#arrival_results .arrival-results-none').show();
      } else {
        const arrivalGroups = _.groupBy(
          arrivals,
          (arrival) =>
            `${arrival.route.route_id}||${arrival.direction.direction_id}`
        );
        const sortedArrivalGroups = _.sortBy(arrivalGroups, (arrivalGroup) => {
          const { route } = arrivalGroup[0];
          return Number.parseInt(route.route_short_name, 10);
        });
        $('#arrival_results .arrival-results-none').hide();
        $('#arrival_results .arrival-results-error').hide();
        $('#arrival_results .arrival-results-container').html(
          sortedArrivalGroups.map((arrivalGroup) =>
            formatArrivalGroup(arrivalGroup)
          )
        );
      }

      hideLoading();
      $('#arrival_results').show();
    }

    function renderError(stop) {
      renderStopInfo(stop);
      $('#arrival_results .arrival-results-error').show();

      hideLoading();
      $('#arrival_results').show();
    }

    function selectStop({ stopId, stopCode, directionId, routeId }) {
      $('.stop-code-invalid').hide();
      const stop = stops.find(
        (stop) => stop.stop_id === stopId || stop.stop_code === stopCode
      );
      const route = routes.find((route) => route.route_id === routeId);
      const direction = route
        ? route.directions.find(
            (direction) => direction.direction_id.toString() === directionId
          )
        : undefined;

      if (!stop) {
        $('.stop-code-invalid').show();
        return;
      }

      selectedArrivalParameters = { stop, direction, route };

      resetResults();
      showLoading();
      updateArrivals();

      // Every refresh interval seconds, check for tripupdates
      arrivalsTimeout = setInterval(
        () => updateArrivals(),
        config.refreshIntervalSeconds * 1000
      );
    }

    function getRouteAndDirectionFromTrip(tripId) {
      let tripRoute;
      let tripDirection;
      for (const route of routes) {
        for (const direction of route.directions) {
          if (direction.trip_ids.includes(tripId)) {
            tripDirection = direction;
            tripRoute = route;
            break;
          }
        }

        if (tripDirection && tripRoute) {
          break;
        }
      }

      return {
        route: tripRoute,
        direction: tripDirection,
      };
    }

    function filterArrivals(arrivals, { stop, direction, route }) {
      // Remove departure information for last stoptime by stop_sequence if it has any
      const cleanedArrivals = arrivals.map((arrival) => {
        const stopTimeUpdates = arrival?.trip_update?.stop_time_update;

        if (stopTimeUpdates && stopTimeUpdates.length >= 2) {
          delete stopTimeUpdates[0].arrival;
          delete stopTimeUpdates[stopTimeUpdates.length - 1].departure;
        }

        return arrival;
      });

      const filteredArrivals = [];

      for (const arrival of cleanedArrivals) {
        let filteredArrival = {};

        if (route) {
          if (!arrival || !arrival.trip_update || !arrival.trip_update.trip) {
            continue;
          }

          if (
            !direction ||
            !direction.trip_ids.includes(arrival.trip_update.trip.trip_id)
          ) {
            continue;
          }

          filteredArrival.route = route;
          filteredArrival.direction = direction;
        } else if (stop) {
          if (
            !arrival ||
            !arrival.trip_update ||
            !arrival.trip_update.stop_time_update
          ) {
            continue;
          }

          // Get route and direction from trip_id
          filteredArrival = getRouteAndDirectionFromTrip(
            arrival.trip_update.trip.trip_id
          );
        }

        filteredArrival.stoptime = arrival.trip_update.stop_time_update.find(
          (stopTimeUpdate) => stopTimeUpdate.stop_id === stop.stop_id
        );

        if (!filteredArrival.stoptime || !filteredArrival.stoptime.departure) {
          continue;
        }

        // Hide arrivals more than 90 minutes in the future
        if (
          filteredArrival.stoptime.departure.time - Date.now() / 1000 >
          90 * 60
        ) {
          continue;
        }

        filteredArrivals.push(filteredArrival);
      }

      return filteredArrivals;
    }

    async function updateArrivals(forceRefresh) {
      try {
        const { stop, direction, route } = selectedArrivalParameters;
        // Use existing data if less than the refresh interval seconds old
        const minimumAge = Date.now() - config.refreshIntervalSeconds * 1000;
        if (
          !arrivalsResponse ||
          arrivalsResponse.timestamp < minimumAge ||
          forceRefresh === true
        ) {
          const arrivals = await fetchTripUpdates();

          // Don't use new arrival info if nothing is returned.
          if (!arrivals || arrivals.length === 0) {
            console.error('No arrivals returned');
            return;
          }

          arrivalsResponse = { arrivals, timestamp: Date.now() };
        }

        renderResults(
          stop,
          filterArrivals(arrivalsResponse.arrivals, { stop, direction, route })
        );

        if (stop.stop_id) {
          updateUrlWithParameters(stop.stop_code);
        }
      } catch (error) {
        console.error(error);
        renderError(selectedArrivalParameters?.stop);
      }
    }

    $('#real_time_arrivals input[name="arrival_type"]').change((event) => {
      const type = $(event.target).val();

      $('#real_time_arrivals #route_form').toggleClass(
        'hidden-form',
        type !== 'route'
      );
      $('#real_time_arrivals #stop_id_form').toggleClass(
        'hidden-form',
        type !== 'stop_id'
      );

      $('#real_time_arrivals #arrival_stop').val('').prop('disabled', true);

      $('#real_time_arrivals #arrival_direction option:gt(0)').remove();
      $('#real_time_arrivals #arrival_stop option:gt(0)').remove();
      resetResults();
    });

    $('#real_time_arrivals #arrival_route').change((event) => {
      const routeId = $(event.target).val();

      $('#real_time_arrivals #arrival_stop').val('').prop('disabled', true);

      $('#real_time_arrivals #arrival_direction option:gt(0)').remove();
      $('#real_time_arrivals #arrival_stop option:gt(0)').remove();
      resetResults();

      if (routeId === '') {
        $('#real_time_arrivals #arrival_direction')
          .val('')
          .prop('disabled', true);
      } else {
        $('#real_time_arrivals #arrival_direction')
          .val('')
          .prop('disabled', false);

        const route = routes.find((route) => route.route_id === routeId);

        if (!route) {
          return console.warn(`Unable to find route ${routeId}`);
        }

        $('#real_time_arrivals #arrival_direction').append(
          route.directions.map((direction) =>
            $('<option>').val(direction.direction_id).text(direction.direction)
          )
        );
      }
    });

    $('#real_time_arrivals #arrival_direction').change((event) => {
      const routeId = $('#real_time_arrivals #arrival_route').val();
      const directionId = $(event.target).val();

      $('#real_time_arrivals #arrival_stop option:gt(0)').remove();
      resetResults();

      if (directionId === '') {
        $('#real_time_arrivals #arrival_stop').val('').prop('disabled', true);
      } else {
        $('#real_time_arrivals #arrival_stop').val('').prop('disabled', false);

        const route = routes.find((route) => route.route_id === routeId);

        if (!route) {
          return console.warn(`Unable to find route ${routeId}`);
        }

        const direction = route.directions.find(
          (direction) => direction.direction_id.toString() === directionId
        );

        $('#real_time_arrivals #arrival_stop').append(
          direction.stopIds.map((stopId) => {
            const stop = stops.find((stop) => stop.stop_id === stopId);
            return $('<option>').val(stop.stop_id).text(stop.stop_name);
          })
        );
      }
    });

    $('#real_time_arrivals #arrival_stop').change((event) => {
      const routeId = $('#real_time_arrivals #arrival_route').val();
      const directionId = $('#real_time_arrivals #arrival_direction').val();
      const stopId = $(event.target).val();

      selectStop({
        stopId,
        routeId,
        directionId,
      });
    });

    $('#stop_id_form').submit((event) => {
      event.preventDefault();
      $('.stop-code-invalid').hide();

      const stopCode = $('#arrival_stop_code').val();

      if (stopCode === '') {
        $('.stop-code-invalid').show();
        return;
      }

      selectStop({
        stopCode,
      });
    });

    $('#arrival_results .arrival-results-fetchtime').click((event) => {
      event.preventDefault();
      resetResults();
      showLoading();
      updateArrivals(true);
    });

    accessibleAutocomplete({
      element: $('#arrival_stop_code_container').get(0),
      id: 'arrival_stop_code',
      source(query, populateResults) {
        const filteredResults = stops.filter((stop) => {
          if (stop.stop_code.startsWith(query.trim())) {
            return true;
          }

          return stop.stop_name.toLowerCase().includes(query.toLowerCase());
        });
        populateResults(filteredResults);
      },
      minLength: 2,
      autoselect: true,
      placeholder: $('#arrival_stop_code_container').data('placeholder'),
      showNoOptionsFound: false,
      templates: {
        inputValue: (result) => result && result.stop_code,
        suggestion(result) {
          if (!result) {
            return;
          }

          if (typeof result === 'string') {
            return result;
          }

          const stopCode = result.is_parent_station
            ? $('#arrival_stop_code_container').data('stop-code-all')
            : result.stop_code;

          return `<strong>${result.stop_name}</strong> (${stopCode})`;
        },
      },
      onConfirm(selectedStop) {
        if (!selectedStop) {
          return;
        }

        $('#arrival_stop_code').val(selectedStop.stop_code);
        $('#stop_id_form').trigger('submit');
      },
      defaultValue: initialStopCode,
    });
  });
}
